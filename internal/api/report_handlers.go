package api

import (
	"context"
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

func (h *Handler) GetD2DRouteCoverageReport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	fromDateStr := r.URL.Query().Get("from_date")
	toDateStr := r.URL.Query().Get("to_date")

	fromDate, err := time.Parse("2006-01-02", fromDateStr)
	if err != nil {
		fromDate = time.Now()
	}
	toDate, err := time.Parse("2006-01-02", toDateStr)
	if err != nil {
		toDate = time.Now()
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

			// Calculate Coverage
			cps, err := h.routeRepo.GetCheckpointsByRoute(ctx, a.RouteID)
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

			forceRecalc := r.URL.Query().Get("force_recalc") == "true"
			if forceRecalc {
				// Clear existing logs to force a full recalculation
				h.gpsRepo.Pool().Exec(ctx, "DELETE FROM route_coverage_logs WHERE vehicle_id = $1 AND route_id = $2 AND report_date = $3", a.VehicleID, a.RouteID, a.Date)
			}

			// Check existing logs first if not forced
			if !forceRecalc {
				logs, err := h.routeRepo.GetCoverageHitLogs(ctx, a.VehicleID, a.RouteID, a.Date)
				if err == nil {
					uniqueHits := make(map[int]bool)
					for _, log := range logs {
						uniqueHits[log.CheckpointID] = true
					}
					
					// If we already have 100% coverage, completely skip the heavy recalculation step!
					if len(uniqueHits) == a.TotalCheckpoints {
						a.CoveredPercentage = 100
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
						return
					}
				}
			}

			// --- Retroactively calculate missing coverage if not 100% (or if forced) ---
			recalculateCoverage(ctx, h.gpsRepo, h.routeRepo, a.VehicleID, a.RouteID, a.Date)
			h.routeEngine.RefreshCache()
			// -------------------------------------------------------------------

			logs, err := h.routeRepo.GetCoverageHitLogs(ctx, a.VehicleID, a.RouteID, a.Date)
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

func recalculateCoverage(ctx context.Context, gpsRepo *repository.GPSRepository, routeRepo *repository.RouteRepository, vehicleID int, routeID int, dateStr string) {
	// Parse date
	dayStart, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return
	}
	dayEnd := dayStart.Add(24 * time.Hour)

	// Fetch historical GPS data
	gpsData, err := gpsRepo.GetByVehicle(ctx, vehicleID, dayStart, dayEnd)
	if err != nil || len(gpsData) == 0 {
		// Clear any buggy logs in the DB to heal it
		gpsRepo.Pool().Exec(ctx, "DELETE FROM route_coverage_logs WHERE vehicle_id = $1 AND route_id = $2 AND report_date = $3", vehicleID, routeID, dateStr)
		return
	}

	// Smooth and filter out outlier jumps to align with the playback page!
	gpsData = smoothGpsData(gpsData)
	if len(gpsData) == 0 {
		gpsRepo.Pool().Exec(ctx, "DELETE FROM route_coverage_logs WHERE vehicle_id = $1 AND route_id = $2 AND report_date = $3", vehicleID, routeID, dateStr)
		return
	}

	// Fetch checkpoints
	checkpoints, err := routeRepo.GetCheckpointsByRoute(ctx, routeID)
	if err != nil || len(checkpoints) == 0 {
		return
	}

	// Calculate which checkpoints were actually hit and at what time
	physicalHits := make(map[int]time.Time)
	for _, cp := range checkpoints {
		for _, pt := range gpsData {
			distKm := utils.Haversine(pt.Lat, pt.Lng, cp.Latitude, cp.Longitude)
			distMeters := distKm * 1000.0
			tolerance := 10.0 // Always 10 meters for all checkpoints
			if distMeters <= tolerance {
				physicalHits[cp.ID] = pt.Time
				break // Found first chronological hit, move to next checkpoint
			}
		}
	}

	// Fetch existing logs in the DB to compare and reconcile
	existingLogs, err := routeRepo.GetCoverageHitLogs(ctx, vehicleID, routeID, dateStr)
	dbHits := make(map[int]time.Time)
	if err == nil {
		for _, l := range existingLogs {
			dbHits[l.CheckpointID] = l.HitTime
		}
	}

	// Reconcile:
	// 1. Delete false hits (checkpoints in DB that were NOT physically hit)
	for cpID := range dbHits {
		if _, exists := physicalHits[cpID]; !exists {
			gpsRepo.Pool().Exec(ctx, "DELETE FROM route_coverage_logs WHERE vehicle_id = $1 AND route_id = $2 AND checkpoint_id = $3 AND report_date = $4", vehicleID, routeID, cpID, dateStr)
		}
	}

	// 2. Insert missing hits or update incorrect hit times
	for cpID, hitTime := range physicalHits {
		dbTime, exists := dbHits[cpID]
		if !exists {
			// Insert new hit
			err := routeRepo.LogCheckpointHit(ctx, vehicleID, routeID, cpID, hitTime)
			if err != nil {
				log.Error().Err(err).Msg("Failed to backfill checkpoint hit during reconciliation")
			}
		} else if !dbTime.Equal(hitTime) {
			// Update incorrect hit time by deleting and re-inserting
			gpsRepo.Pool().Exec(ctx, "DELETE FROM route_coverage_logs WHERE vehicle_id = $1 AND route_id = $2 AND checkpoint_id = $3 AND report_date = $4", vehicleID, routeID, cpID, dateStr)
			err := routeRepo.LogCheckpointHit(ctx, vehicleID, routeID, cpID, hitTime)
			if err != nil {
				log.Error().Err(err).Msg("Failed to update checkpoint hit time during reconciliation")
			}
		}
	}
}
