package api

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"sync"
	"time"

	"gps-tracking-system/internal/decoder"
	"gps-tracking-system/internal/repository"
	"gps-tracking-system/internal/utils"

	"github.com/rs/zerolog/log"
)

var recalcLocks sync.Map // maps string key ("vehicle-route-date") to *sync.Mutex

func getRecalcMutex(vehicleID, routeID int, dateStr string) *sync.Mutex {
	key := fmt.Sprintf("%d-%d-%s", vehicleID, routeID, dateStr)
	val, _ := recalcLocks.LoadOrStore(key, &sync.Mutex{})
	return val.(*sync.Mutex)
}

func (h *Handler) GetD2DRouteCoverageReport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	fromDateStr := r.URL.Query().Get("from_date")
	toDateStr := r.URL.Query().Get("to_date")
	forceRecalc := r.URL.Query().Get("force_recalc") == "true"

	fromDate, err := time.ParseInLocation("2006-01-02", fromDateStr, utils.IndianLocation)
	if err != nil {
		fromDate = utils.CurrentTimeInIndia()
	}
	toDate, err := time.ParseInLocation("2006-01-02", toDateStr, utils.IndianLocation)
	if err != nil {
		toDate = utils.CurrentTimeInIndia()
	}

	// Fetch all assignments for the date range
	assignments, err := h.routeRepo.GetD2DAssignments(ctx, fromDate, toDate)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch assignments: " + err.Error()})
		return
	}

	// Parse optional filters
	filterZoneID, _ := strconv.Atoi(r.URL.Query().Get("zone_id"))
	filterWardID, _ := strconv.Atoi(r.URL.Query().Get("ward_id"))
	filterShiftID, _ := strconv.Atoi(r.URL.Query().Get("shift_id"))
	filterRouteTypeID, _ := strconv.Atoi(r.URL.Query().Get("route_type_id"))
	filterRouteID, _ := strconv.Atoi(r.URL.Query().Get("route_id"))

	var filtered []interface{}
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, a := range assignments {
		// Apply filters
		if filterZoneID > 0 && a.ZoneID != filterZoneID {
			continue
		}
		if filterWardID > 0 && a.WardID != filterWardID {
			continue
		}
		if filterShiftID > 0 && a.ShiftID != filterShiftID {
			continue
		}
		if filterRouteTypeID > 0 && a.RouteTypeID != filterRouteTypeID {
			continue
		}
		if filterRouteID > 0 && a.RouteID != filterRouteID {
			continue
		}

		wg.Add(1)
		go func(a repository.CoverageReportRow) {
			defer wg.Done()

			// Create a separate context with a 30-second timeout for the goroutine
			// to prevent HTTP request cancellation from truncating DB operations
			runCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()

			// Calculate Coverage
			cps, err := h.routeRepo.GetCheckpointsByRoute(runCtx, a.RouteID)
			if err != nil {
				return
			}

			a.TotalCheckpoints = len(cps)
			if a.TotalCheckpoints == 0 {
				a.CoveredPercentage = 0
				a.InOrderPercentage = 0
				mu.Lock()
				filtered = append(filtered, a)
				mu.Unlock()
				return
			}

			// Check if we already have coverage records for this vehicle, route, and date
			hasHistory := false
			isToday := (a.Date == utils.CurrentTimeInIndia().Format("2006-01-02"))
			localForceRecalc := forceRecalc || isToday

			if localForceRecalc || !hasHistory {
				// Acquire lock for this vehicle/route/date
				mu := getRecalcMutex(a.VehicleID, a.RouteID, a.Date)
				mu.Lock()

				// Re-check hasHistory under the lock to avoid redundant calculation
				var err error
				if !localForceRecalc {
					hasHistory, err = h.routeRepo.HasCoverageRecords(runCtx, a.VehicleID, a.RouteID, a.Date)
				}

				if localForceRecalc || err != nil || !hasHistory {
					recalculateCoverage(runCtx, h.gpsRepo, h.routeRepo, a.VehicleID, a.RouteID, a.Date, h.routeEngine.RequireSequentialCheckpoints, h.routeEngine.MaxCheckpointSpeedKmh)
					h.routeEngine.RefreshCache()
				}
				mu.Unlock()
			}

			logs, err := h.routeRepo.GetCoverageHitLogs(runCtx, a.VehicleID, a.RouteID, a.Date)
			if err != nil {
				return
			}

			uniqueHits := make(map[int]bool)
			for _, log := range logs {
				uniqueHits[log.CheckpointID] = true
			}
			a.CoveredPercentage = math.Round((float64(len(uniqueHits)) / float64(a.TotalCheckpoints)) * 100)

			// Calculate In-Order coverage
			inOrderHits := 0
			lastSeq := -1

			for _, log := range logs {
				if log.SequenceOrder > lastSeq {
					inOrderHits++
					lastSeq = log.SequenceOrder
				}
			}

			if inOrderHits > a.TotalCheckpoints {
				inOrderHits = a.TotalCheckpoints
			}

			a.InOrderPercentage = math.Round((float64(inOrderHits) / float64(a.TotalCheckpoints)) * 100)
			
			mu.Lock()
			filtered = append(filtered, a)
			mu.Unlock()
		}(a)
	}

	wg.Wait()

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    filtered,
	})
}

func smoothGpsData(points []decoder.AVLData) []decoder.AVLData {
	if len(points) == 0 {
		return points
	}

	// First filter out invalid coordinates (0.0)
	var validPoints []decoder.AVLData
	for _, p := range points {
		if p.Lat != 0.0 && p.Lng != 0.0 {
			validPoints = append(validPoints, p)
		}
	}

	if len(validPoints) < 3 {
		return validPoints
	}

	// 1. Outlier Filtering (Remove impossible jumps > 120 km/h and distance > 0.05 km)
	filtered := []decoder.AVLData{validPoints[0]}
	for i := 1; i < len(validPoints); i++ {
		prev := filtered[len(filtered)-1]
		curr := validPoints[i]

		distKm := utils.Haversine(prev.Lat, prev.Lng, curr.Lat, curr.Lng)
		timeDiffHrs := curr.Time.Sub(prev.Time).Hours()

		if timeDiffHrs > 0 {
			speedKmh := distKm / timeDiffHrs
			if speedKmh > 120.0 && distKm > 0.05 {
				continue // skip outlier jump
			}
		}
		filtered = append(filtered, curr)
	}

	if len(filtered) < 3 {
		return filtered
	}

	// 2. Moving Average Smoothing (Window size = 5)
	smoothed := make([]decoder.AVLData, 0, len(filtered))
	windowSize := 2
	for i := 0; i < len(filtered); i++ {
		start := i - windowSize
		if start < 0 {
			start = 0
		}
		end := i + windowSize
		if end >= len(filtered) {
			end = len(filtered) - 1
		}

		var sumLat, sumLng float64
		var count float64

		for j := start; j <= end; j++ {
			sumLat += filtered[j].Lat
			sumLng += filtered[j].Lng
			count++
		}

		currSmoothed := filtered[i]
		currSmoothed.Lat = sumLat / count
		currSmoothed.Lng = sumLng / count
		smoothed = append(smoothed, currSmoothed)
	}

	return smoothed
}

func distanceToSegment(pLat, pLng, aLat, aLng, bLat, bLng float64) float64 {
	if aLat == bLat && aLng == bLng {
		return utils.Haversine(pLat, pLng, aLat, aLng) * 1000.0
	}

	latMid := ((aLat + bLat) / 2.0) * math.Pi / 180.0
	kx := math.Cos(latMid)

	bx := (bLng - aLng) * kx
	by := bLat - aLat
	px := (pLng - aLng) * kx
	py := pLat - aLat

	segmentLenSq := bx*bx + by*by
	if segmentLenSq == 0 {
		return utils.Haversine(pLat, pLng, aLat, aLng) * 1000.0
	}

	t := (px*bx + py*by) / segmentLenSq
	if t < 0.0 {
		t = 0.0
	} else if t > 1.0 {
		t = 1.0
	}

	cLat := aLat + t*(bLat-aLat)
	cLng := aLng + t*(bLng-aLng)

	return utils.Haversine(pLat, pLng, cLat, cLng) * 1000.0
}

func recalculateCoverage(ctx context.Context, gpsRepo *repository.GPSRepository, routeRepo *repository.RouteRepository, vehicleID int, routeID int, dateStr string, requireSequential bool, maxSpeed float64) {
	// Parse date
	dayStart, err := time.ParseInLocation("2006-01-02", dateStr, utils.IndianLocation)
	if err != nil {
		return
	}
	dayEnd := dayStart.Add(24 * time.Hour)

	// Fetch historical GPS data
	gpsData, err := gpsRepo.GetByVehicle(ctx, vehicleID, dayStart, dayEnd)
	if err != nil {
		if ctx.Err() == nil {
			log.Error().Err(err).Msg("Failed to query GPS data for coverage calculation")
		}
		return
	}
	if len(gpsData) == 0 {
		if ctx.Err() == nil {
			// Clear any buggy logs and miss reasons in the DB to heal it
			gpsRepo.Pool().Exec(ctx, "DELETE FROM route_coverage_logs WHERE vehicle_id = $1 AND route_id = $2 AND report_date = $3", vehicleID, routeID, dateStr)
			gpsRepo.Pool().Exec(ctx, "DELETE FROM route_coverage_miss_reasons WHERE vehicle_id = $1 AND route_id = $2 AND report_date = $3", vehicleID, routeID, dateStr)
		}
		return
	}

	// Smooth and filter out outlier jumps to align with the playback page!
	gpsData = smoothGpsData(gpsData)
	if len(gpsData) == 0 {
		if ctx.Err() == nil {
			gpsRepo.Pool().Exec(ctx, "DELETE FROM route_coverage_logs WHERE vehicle_id = $1 AND route_id = $2 AND report_date = $3", vehicleID, routeID, dateStr)
			gpsRepo.Pool().Exec(ctx, "DELETE FROM route_coverage_miss_reasons WHERE vehicle_id = $1 AND route_id = $2 AND report_date = $3", vehicleID, routeID, dateStr)
		}
		return
	}

	// Fetch checkpoints
	checkpoints, err := routeRepo.GetCheckpointsByRoute(ctx, routeID)
	if err != nil {
		if ctx.Err() == nil {
			log.Error().Err(err).Msg("Failed to fetch checkpoints for route")
		}
		return
	}
	if len(checkpoints) == 0 {
		return
	}

	// Initialize all checkpoints as missed with reason "Never Reached"
	missReasons := make(map[int]string)
	for _, cp := range checkpoints {
		missReasons[cp.ID] = "Never Reached"
	}

	physicalHits := make(map[int]time.Time)
	expectedIdx := 0 // index of the checkpoint we are currently looking for

	// First check the very first point
	if len(gpsData) > 0 {
		if requireSequential {
			if expectedIdx < len(checkpoints) {
				cp := checkpoints[expectedIdx]
				dist := utils.Haversine(gpsData[0].Lat, gpsData[0].Lng, cp.Latitude, cp.Longitude) * 1000.0
				if dist <= 10.0 {
					if gpsData[0].Speed <= maxSpeed {
						physicalHits[cp.ID] = gpsData[0].Time
						delete(missReasons, cp.ID)
						expectedIdx++
					} else {
						missReasons[cp.ID] = "Speed Too High (" + strconv.FormatFloat(gpsData[0].Speed, 'f', 1, 64) + " km/h)"
					}
				}
			}
		} else {
			// Non-sequential check for the first point
			for _, cp := range checkpoints {
				dist := utils.Haversine(gpsData[0].Lat, gpsData[0].Lng, cp.Latitude, cp.Longitude) * 1000.0
				if dist <= 10.0 {
					if gpsData[0].Speed <= maxSpeed {
						physicalHits[cp.ID] = gpsData[0].Time
						delete(missReasons, cp.ID)
					} else {
						missReasons[cp.ID] = "Speed Too High (" + strconv.FormatFloat(gpsData[0].Speed, 'f', 1, 64) + " km/h)"
					}
				}
			}
		}
	}

	// Now check segments and points chronologically
	for i := 1; i < len(gpsData); i++ {
		prev := gpsData[i-1]
		curr := gpsData[i]

		// For each checkpoint that is not yet hit, check if the vehicle got close
		for cpIdx, cp := range checkpoints {
			if _, hit := physicalHits[cp.ID]; hit {
				continue
			}

			// Only do segment matching if the pings are close in time and space to avoid teleport ghost hits
			timeDiffSec := curr.Time.Sub(prev.Time).Seconds()
			distBetweenPings := utils.Haversine(prev.Lat, prev.Lng, curr.Lat, curr.Lng) * 1000.0

			var distMeters float64
			if timeDiffSec > 60.0 || distBetweenPings > 200.0 {
				// Fallback to point check only
				distMeters = utils.Haversine(curr.Lat, curr.Lng, cp.Latitude, cp.Longitude) * 1000.0
			} else {
				distMeters = distanceToSegment(cp.Latitude, cp.Longitude, prev.Lat, prev.Lng, curr.Lat, curr.Lng)
			}

			if distMeters <= 10.0 {
				if requireSequential {
					if cpIdx == expectedIdx {
						// Expected checkpoint! Check speed limit
						if curr.Speed <= maxSpeed {
							physicalHits[cp.ID] = curr.Time
							delete(missReasons, cp.ID)
							expectedIdx++
						} else {
							missReasons[cp.ID] = "Speed Too High (" + strconv.FormatFloat(curr.Speed, 'f', 1, 64) + " km/h)"
						}
					} else if cpIdx > expectedIdx {
						// Out of sequence!
						if curr.Speed <= maxSpeed {
							missReasons[cp.ID] = "Out of Sequence (Expected Checkpoint #" + strconv.Itoa(expectedIdx+1) + ")"
						} else {
							missReasons[cp.ID] = "Out of Sequence & Speed Too High (" + strconv.FormatFloat(curr.Speed, 'f', 1, 64) + " km/h)"
						}
					}
				} else {
					// Non-sequential check: any checkpoint within range
					if curr.Speed <= maxSpeed {
						physicalHits[cp.ID] = curr.Time
						delete(missReasons, cp.ID)
					} else {
						missReasons[cp.ID] = "Speed Too High (" + strconv.FormatFloat(curr.Speed, 'f', 1, 64) + " km/h)"
					}
				}
			}
		}
	}

	// 1. Start a database transaction to group deletes and inserts together.
	// This prevents concurrent read queries from seeing a "0 coverage logs" state (zero downtime).
	tx, err := gpsRepo.Pool().Begin(ctx)
	if err != nil {
		log.Error().Err(err).Msg("Failed to start transaction for recalculation")
		return
	}
	defer tx.Rollback(ctx)

	// Delete all existing logs and miss reasons for this vehicle, route, and date
	_, _ = tx.Exec(ctx, "DELETE FROM route_coverage_logs WHERE vehicle_id = $1 AND route_id = $2 AND report_date = $3", vehicleID, routeID, dateStr)
	_, _ = tx.Exec(ctx, "DELETE FROM route_coverage_miss_reasons WHERE vehicle_id = $1 AND route_id = $2 AND report_date = $3", vehicleID, routeID, dateStr)

	// 2. Batch insert physicalHits
	if len(physicalHits) > 0 {
		query := "INSERT INTO route_coverage_logs (vehicle_id, route_id, checkpoint_id, report_date, hit_time) VALUES "
		vals := []interface{}{}
		for cpID, hitTime := range physicalHits {
			idx := len(vals)
			query += fmt.Sprintf("($%d, $%d, $%d, $%d, $%d),", idx+1, idx+2, idx+3, idx+4, idx+5)
			vals = append(vals, vehicleID, routeID, cpID, dateStr, hitTime)
		}
		query = query[:len(query)-1] // trim trailing comma
		query += " ON CONFLICT (vehicle_id, route_id, checkpoint_id, report_date) DO NOTHING"
		_, err = tx.Exec(ctx, query, vals...)
		if err != nil {
			log.Error().Err(err).Msg("Failed to batch insert coverage hits during recalculation")
			return
		}
	}

	// 3. Batch insert miss reasons
	if len(missReasons) > 0 {
		query := "INSERT INTO route_coverage_miss_reasons (vehicle_id, route_id, checkpoint_id, report_date, reason) VALUES "
		vals := []interface{}{}
		for cpID, reason := range missReasons {
			idx := len(vals)
			query += fmt.Sprintf("($%d, $%d, $%d, $%d, $%d),", idx+1, idx+2, idx+3, idx+4, idx+5)
			vals = append(vals, vehicleID, routeID, cpID, dateStr, reason)
		}
		query = query[:len(query)-1] // trim trailing comma
		query += " ON CONFLICT (vehicle_id, route_id, checkpoint_id, report_date) DO UPDATE SET reason = EXCLUDED.reason"
		_, err = tx.Exec(ctx, query, vals...)
		if err != nil {
			log.Error().Err(err).Msg("Failed to batch insert miss reasons during recalculation")
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		log.Error().Err(err).Msg("Failed to commit transaction for recalculation")
	}
}
