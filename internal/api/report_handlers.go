package api

import (
	"context"
	"crypto/rand"
	"fmt"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"gps-tracking-system/internal/decoder"
	"gps-tracking-system/internal/repository"
	"gps-tracking-system/internal/utils"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

type d2dDebugLogger struct {
	mu        sync.Mutex
	logs      []string
	requestID string
	debugMode bool
}

func (l *d2dDebugLogger) Log(format string, args ...interface{}) {
	if l == nil {
		return
	}
	msg := fmt.Sprintf(format, args...)
	log.Info().Msg(msg)

	l.mu.Lock()
	l.logs = append(l.logs, msg)
	l.mu.Unlock()
}

func (l *d2dDebugLogger) LogCritical(msg string) {
	if l == nil {
		return
	}
	logMsg := fmt.Sprintf("[D2D][CRITICAL] %s", msg)
	log.Error().Msg(logMsg)

	l.mu.Lock()
	l.logs = append(l.logs, logMsg)
	l.mu.Unlock()
}

func generateUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40 // Version 4
	b[8] = (b[8] & 0x3f) | 0x80 // Variant is 10
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

var recalcLocks sync.Map // maps string key ("vehicle-route-date") to *sync.Mutex

func init() {
	go func() {
		ticker := time.NewTicker(12 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			cleanupOldRecalcMutexes()
		}
	}()
}

func cleanupOldRecalcMutexes() {
	today := utils.CurrentTimeInIndia().Format("2006-01-02")
	yesterday := utils.CurrentTimeInIndia().AddDate(0, 0, -1).Format("2006-01-02")

	recalcLocks.Range(func(key, value interface{}) bool {
		k, ok := key.(string)
		if !ok {
			return true
		}
		if !strings.Contains(k, today) && !strings.Contains(k, yesterday) {
			recalcLocks.Delete(key)
		}
		return true
	})
}

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

	debugParam := r.URL.Query().Get("debug") == "true"
	debugMode := debugParam || os.Getenv("DEBUG_MODE") == "true"

	var dbg *d2dDebugLogger
	requestID := "N/A"
	if debugMode {
		requestID = generateUUID()
		dbg = &d2dDebugLogger{
			requestID: requestID,
			debugMode: debugMode,
		}
	}

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
	filterVehicleID, _ := strconv.Atoi(r.URL.Query().Get("vehicle_id"))

	dbg.Log("[D2D][REQUEST_START] request_id=%s route_id=%d vehicle_id=%d date=%s_to_%s force_recalc=%t timestamp=%s",
		requestID, filterRouteID, filterVehicleID, fromDateStr, toDateStr, forceRecalc, time.Now().Format(time.RFC3339))

	startTime := time.Now()

	var filtered []interface{}
	var mu sync.Mutex
	var wg sync.WaitGroup

	var vehiclesProcessed int64
	var vehiclesFailed int64

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
				log.Error().Err(err).
					Int("vehicle_id", a.VehicleID).
					Int("route_id", a.RouteID).
					Str("date", a.Date).
					Msg("Failed to get checkpoints for D2D report")
				a.CoveredPercentage = 0
				a.InOrderPercentage = 0

				atomic.AddInt64(&vehiclesFailed, 1)
				atomic.AddInt64(&vehiclesProcessed, 1)

				dbg.Log("[D2D][RESPONSE_ROW] request_id=%s vehicle_id=%d included_in_response=true coverage_percentage=0.0 hit_count=0 reason_if_skipped=%q",
					requestID, a.VehicleID, "GetCheckpointsByRoute failed: " + err.Error())
				dbg.LogCritical(fmt.Sprintf("request_id=%s vehicle_id=%d event=VEHICLE_SKIPPED reason=%q", requestID, a.VehicleID, "GetCheckpointsByRoute failed: " + err.Error()))

				mu.Lock()
				filtered = append(filtered, a)
				mu.Unlock()
				return
			}

			a.TotalCheckpoints = len(cps)
			if a.TotalCheckpoints == 0 {
				a.CoveredPercentage = 0
				a.InOrderPercentage = 0

				atomic.AddInt64(&vehiclesProcessed, 1)

				dbg.Log("[D2D][RESPONSE_ROW] request_id=%s vehicle_id=%d included_in_response=true coverage_percentage=0.0 hit_count=0 reason_if_skipped=%q",
					requestID, a.VehicleID, "TotalCheckpoints = 0")

				mu.Lock()
				filtered = append(filtered, a)
				mu.Unlock()
				return
			}

			// Check if we already have coverage records for this vehicle, route, and date
			isToday := (a.Date == utils.CurrentTimeInIndia().Format("2006-01-02"))
			localForceRecalc := forceRecalc || isToday

			var hasHistory bool
			var histErr error
			if !localForceRecalc {
				hasHistory, histErr = h.routeRepo.HasCoverageRecords(runCtx, a.VehicleID, a.RouteID, a.Date)
				if histErr != nil {
					log.Error().Err(histErr).Int("vehicle_id", a.VehicleID).Str("date", a.Date).Msg("Failed to check coverage history")
					hasHistory = false
				}
			}

			if localForceRecalc || !hasHistory {
				// Acquire lock for this vehicle/route/date
				recalcMu := getRecalcMutex(a.VehicleID, a.RouteID, a.Date)
				recalcMu.Lock()

				// Re-check hasHistory under the lock to avoid redundant calculation
				if !localForceRecalc && histErr == nil {
					hasHistory, _ = h.routeRepo.HasCoverageRecords(runCtx, a.VehicleID, a.RouteID, a.Date)
				}

				if localForceRecalc || !hasHistory {
					recalculateCoverage(runCtx, h.gpsRepo, h.routeRepo, a.VehicleID, a.RouteID, a.Date, h.routeEngine.RequireSequentialCheckpoints, h.routeEngine.MaxCheckpointSpeedKmh, a.Imei, dbg)
				}
				recalcMu.Unlock()
			}

			logs, err := h.routeRepo.GetCoverageHitLogs(runCtx, a.VehicleID, a.RouteID, a.Date)
			if err != nil {
				log.Error().Err(err).
					Int("vehicle_id", a.VehicleID).
					Int("route_id", a.RouteID).
					Str("date", a.Date).
					Msg("Failed to get coverage logs for D2D report")
				a.CoveredPercentage = 0
				a.InOrderPercentage = 0

				atomic.AddInt64(&vehiclesFailed, 1)
				atomic.AddInt64(&vehiclesProcessed, 1)

				dbg.Log("[D2D][RESPONSE_ROW] request_id=%s vehicle_id=%d included_in_response=true coverage_percentage=0.0 hit_count=0 reason_if_skipped=%q",
					requestID, a.VehicleID, "GetCoverageHitLogs failed: " + err.Error())
				dbg.LogCritical(fmt.Sprintf("request_id=%s vehicle_id=%d event=VEHICLE_SKIPPED reason=%q", requestID, a.VehicleID, "GetCoverageHitLogs failed: " + err.Error()))

				mu.Lock()
				filtered = append(filtered, a)
				mu.Unlock()
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

			atomic.AddInt64(&vehiclesProcessed, 1)

			dbg.Log("[D2D][RESPONSE_ROW] request_id=%s vehicle_id=%d included_in_response=true coverage_percentage=%.2f hit_count=%d reason_if_skipped=%q",
				requestID, a.VehicleID, a.CoveredPercentage, len(uniqueHits), "nil")

			if a.CoveredPercentage == 0 {
				dbg.LogCritical(fmt.Sprintf("request_id=%s vehicle_id=%d event=COVERAGE_BECOMES_0 coverage_percentage=0.0", requestID, a.VehicleID))
			}

			mu.Lock()
			filtered = append(filtered, a)
			mu.Unlock()
		}(a)
	}

	wg.Wait()

	// If recalculation was triggered for today's date, refresh the cache once at the end
	isTodayRequested := (fromDateStr == utils.CurrentTimeInIndia().Format("2006-01-02") || toDateStr == utils.CurrentTimeInIndia().Format("2006-01-02"))
	if forceRecalc && isTodayRequested {
		h.routeEngine.RefreshCache()
	}

	duration := time.Since(startTime).Milliseconds()
	dbg.Log("[D2D][REQUEST_END] request_id=%s total_duration_ms=%d vehicles_processed=%d vehicles_failed=%d",
		requestID, duration, atomic.LoadInt64(&vehiclesProcessed), atomic.LoadInt64(&vehiclesFailed))

	responsePayload := map[string]interface{}{
		"success": true,
		"data":    filtered,
	}
	if debugMode {
		dbg.mu.Lock()
		responsePayload["debug_payload"] = dbg.logs
		dbg.mu.Unlock()
	}
	sendJSON(w, http.StatusOK, responsePayload)
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

func recalculateCoverage(ctx context.Context, gpsRepo *repository.GPSRepository, routeRepo *repository.RouteRepository, vehicleID int, routeID int, dateStr string, requireSequential bool, maxSpeed float64, imei string, dbg *d2dDebugLogger) {
	requestID := "N/A"
	if dbg != nil {
		requestID = dbg.requestID
	}

	// Parse date
	dayStart, err := time.ParseInLocation("2006-01-02", dateStr, utils.IndianLocation)
	if err != nil {
		if dbg != nil {
			dbg.LogCritical(fmt.Sprintf("request_id=%s vehicle_id=%d event=DATE_PARSE_FAILED date=%s err=%q", requestID, vehicleID, dateStr, err.Error()))
		}
		return
	}
	dayEnd := dayStart.Add(24 * time.Hour)

	// Fetch checkpoints first
	checkpoints, err := routeRepo.GetCheckpointsByRoute(ctx, routeID)
	if err != nil {
		log.Error().Err(err).Msg("Failed to fetch checkpoints for route")
		if dbg != nil {
			dbg.LogCritical(fmt.Sprintf("request_id=%s vehicle_id=%d route_id=%d event=CHECKPOINTS_FETCH_FAILED err=%q", requestID, vehicleID, routeID, err.Error()))
		}
		return
	}

	if dbg != nil {
		cpIDs := make([]int, len(checkpoints))
		for idx, cp := range checkpoints {
			cpIDs[idx] = cp.ID
		}
		dbg.Log("[D2D][CHECKPOINTS_FETCHED] request_id=%s vehicle_id=%d route_id=%d checkpoint_count=%d checkpoint_ids=%v",
			requestID, vehicleID, routeID, len(checkpoints), cpIDs)
	}

	if len(checkpoints) == 0 {
		if dbg != nil {
			dbg.LogCritical(fmt.Sprintf("request_id=%s vehicle_id=%d route_id=%d event=CHECKPOINTS_EMPTY", requestID, vehicleID, routeID))
		}
		return
	}

	// Fetch historical GPS data
	if dbg != nil {
		dbg.Log("[D2D][GPS_QUERY_START] request_id=%s vehicle_id=%d imei=%s start_time=%s end_time=%s",
			requestID, vehicleID, imei, dayStart.Format(time.RFC3339), dayEnd.Format(time.RFC3339))
	}

	startQuery := time.Now()
	gpsData, err := gpsRepo.GetByVehicle(ctx, vehicleID, dayStart, dayEnd)
	queryDuration := time.Since(startQuery).Milliseconds()

	rowsErrStr := "nil"
	if err != nil {
		rowsErrStr = fmt.Sprintf("%q", err.Error())
	}

	if dbg != nil {
		dbg.Log("[D2D][GPS_QUERY_RESULT] request_id=%s vehicle_id=%d gps_row_count=%d query_duration_ms=%d rows_err=%s",
			requestID, vehicleID, len(gpsData), queryDuration, rowsErrStr)
	}

	if err != nil {
		log.Error().Err(err).
			Int("vehicle_id", vehicleID).
			Int("route_id", routeID).
			Str("date", dateStr).
			AnErr("ctx_err", ctx.Err()).
			Msg("Failed to query GPS data for coverage calculation")
		if dbg != nil {
			dbg.LogCritical(fmt.Sprintf("request_id=%s vehicle_id=%d event=GPS_QUERY_FAILED rows_err=%s", requestID, vehicleID, rowsErrStr))
		}
		return
	}

	log.Info().
		Int("vehicle_id", vehicleID).
		Int("route_id", routeID).
		Str("date", dateStr).
		Int("gps_row_count", len(gpsData)).
		Msg("D2D GPS fetch result for recalculation")

	if len(gpsData) == 0 {
		log.Warn().
			Int("vehicle_id", vehicleID).
			Int("route_id", routeID).
			Str("date", dateStr).
			Msg("GPS data empty for recalculation - skipping DELETE to preserve existing coverage (possible TimescaleDB chunk unavailable)")
		if dbg != nil {
			dbg.LogCritical(fmt.Sprintf("request_id=%s vehicle_id=%d event=NO_GPS_DATA_AVAILABLE gps_row_count=0", requestID, vehicleID))
		}
		return
	}

	// Smooth and filter out outlier jumps to align with the playback page!
	gpsData = smoothGpsData(gpsData)

	if dbg != nil {
		firstPts := []string{}
		for i := 0; i < len(gpsData) && i < 5; i++ {
			firstPts = append(firstPts, fmt.Sprintf("{lat:%.6f,lng:%.6f,t:%s}", gpsData[i].Lat, gpsData[i].Lng, gpsData[i].Time.Format(time.RFC3339)))
		}
		lastPts := []string{}
		for i := len(gpsData) - 5; i < len(gpsData); i++ {
			if i >= 0 {
				lastPts = append(lastPts, fmt.Sprintf("{lat:%.6f,lng:%.6f,t:%s}", gpsData[i].Lat, gpsData[i].Lng, gpsData[i].Time.Format(time.RFC3339)))
			}
		}
		firstTimeStr := "N/A"
		lastTimeStr := "N/A"
		if len(gpsData) > 0 {
			firstTimeStr = gpsData[0].Time.Format(time.RFC3339)
			lastTimeStr = gpsData[len(gpsData)-1].Time.Format(time.RFC3339)
		}
		dbg.Log("[D2D][GPS_DATA_ANALYSIS] request_id=%s vehicle_id=%d first_gps_timestamp=%s last_gps_timestamp=%s gps_points_count=%d sample_first_5_points=%v sample_last_5_points=%v",
			requestID, vehicleID, firstTimeStr, lastTimeStr, len(gpsData), firstPts, lastPts)
	}

	// Initialize all checkpoints as missed with reason "Never Reached"
	missReasons := make(map[int]string)
	for _, cp := range checkpoints {
		missReasons[cp.ID] = "Never Reached"
	}

	physicalHits := make(map[int]time.Time)

	type cpDebugInfo struct {
		closestDist   float64
		pointsChecked int
		hit           bool
	}
	cpDbgs := make(map[int]*cpDebugInfo)
	if dbg != nil {
		for _, cp := range checkpoints {
			cpDbgs[cp.ID] = &cpDebugInfo{
				closestDist:   999999.0,
				pointsChecked: 0,
				hit:           false,
			}
		}
	}

	// If we have GPS data, run segment checking and checkpoint hits detection
	if len(gpsData) > 0 {
		expectedIdx := 0 // index of the checkpoint we are currently looking for

		// First check the very first point
		if requireSequential {
			if expectedIdx < len(checkpoints) {
				cp := checkpoints[expectedIdx]
				dist := utils.Haversine(gpsData[0].Lat, gpsData[0].Lng, cp.Latitude, cp.Longitude) * 1000.0
				if dbg != nil {
					cpDbgs[cp.ID].pointsChecked++
					if dist < cpDbgs[cp.ID].closestDist {
						cpDbgs[cp.ID].closestDist = dist
					}
				}
				if dist <= 10.0 {
					if gpsData[0].Speed <= maxSpeed {
						physicalHits[cp.ID] = gpsData[0].Time
						delete(missReasons, cp.ID)
						expectedIdx++
						if dbg != nil {
							cpDbgs[cp.ID].hit = true
						}
					} else {
						missReasons[cp.ID] = "Speed Too High (" + strconv.FormatFloat(gpsData[0].Speed, 'f', 1, 64) + " km/h)"
					}
				}
			}
		} else {
			// Non-sequential check for the first point
			for _, cp := range checkpoints {
				dist := utils.Haversine(gpsData[0].Lat, gpsData[0].Lng, cp.Latitude, cp.Longitude) * 1000.0
				if dbg != nil {
					cpDbgs[cp.ID].pointsChecked++
					if dist < cpDbgs[cp.ID].closestDist {
						cpDbgs[cp.ID].closestDist = dist
					}
				}
				if dist <= 10.0 {
					if gpsData[0].Speed <= maxSpeed {
						physicalHits[cp.ID] = gpsData[0].Time
						delete(missReasons, cp.ID)
						if dbg != nil {
							cpDbgs[cp.ID].hit = true
						}
					} else {
						missReasons[cp.ID] = "Speed Too High (" + strconv.FormatFloat(gpsData[0].Speed, 'f', 1, 64) + " km/h)"
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
					if dbg != nil {
						cpDbgs[cp.ID].hit = true
					}
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

				if dbg != nil {
					cpDbgs[cp.ID].pointsChecked++
					if distMeters < cpDbgs[cp.ID].closestDist {
						cpDbgs[cp.ID].closestDist = distMeters
					}
				}

				if distMeters <= 10.0 {
					if requireSequential {
						if cpIdx == expectedIdx {
							// Expected checkpoint! Check speed limit
							if curr.Speed <= maxSpeed {
								physicalHits[cp.ID] = curr.Time
								delete(missReasons, cp.ID)
								expectedIdx++
								if dbg != nil {
									cpDbgs[cp.ID].hit = true
								}
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
							if dbg != nil {
								cpDbgs[cp.ID].hit = true
							}
						} else {
							missReasons[cp.ID] = "Speed Too High (" + strconv.FormatFloat(curr.Speed, 'f', 1, 64) + " km/h)"
						}
					}
				}
			}
		}
	}

	if dbg != nil {
		for _, cp := range checkpoints {
			info := cpDbgs[cp.ID]
			dbg.Log("[D2D][CHECKPOINT_EVALUATION] request_id=%s vehicle_id=%d checkpoint_id=%d checkpoint_lat=%.6f checkpoint_lng=%.6f checkpoint_radius=%.1f hit=%t closest_distance_found=%.2f gps_points_checked=%d",
				requestID, vehicleID, cp.ID, cp.Latitude, cp.Longitude, cp.RadiusMeters, info.hit, info.closestDist, info.pointsChecked)
		}
	}

	coveragePercentage := 0.0
	if len(checkpoints) > 0 {
		coveragePercentage = float64(len(physicalHits)) / float64(len(checkpoints)) * 100.0
	}
	if dbg != nil {
		dbg.Log("[D2D][COVERAGE_SUMMARY] request_id=%s vehicle_id=%d total_checkpoints=%d physical_hits=%d miss_reasons=%+v coverage_percentage=%.2f",
			requestID, vehicleID, len(checkpoints), len(physicalHits), missReasons, coveragePercentage)
	}

	if coveragePercentage == 0.0 {
		if dbg != nil {
			dbg.LogCritical(fmt.Sprintf("request_id=%s vehicle_id=%d event=COVERAGE_BECOMES_0 coverage_percentage=0.0 total_checkpoints=%d", requestID, vehicleID, len(checkpoints)))
		}
	}

	// 1. Start a database transaction to group deletes and inserts together.
	tx, err := gpsRepo.Pool().Begin(ctx)
	if err != nil {
		log.Error().Err(err).Msg("Failed to start transaction for recalculation")
		if dbg != nil {
			dbg.LogCritical(fmt.Sprintf("request_id=%s vehicle_id=%d event=TX_BEGIN_FAILED err=%q", requestID, vehicleID, err.Error()))
		}
		return
	}

	committed := false
	defer func() {
		if !committed {
			tx.Rollback(ctx)
			if dbg != nil {
				dbg.LogCritical(fmt.Sprintf("request_id=%s vehicle_id=%d event=TX_ROLLBACK", requestID, vehicleID))
			}
		}
	}()

	if dbg != nil {
		dbg.Log("[D2D][TX_BEGIN] request_id=%s vehicle_id=%d", requestID, vehicleID)
	}

	// Delete all existing logs and miss reasons for this vehicle, route, and date
	resLogs, errLogs := tx.Exec(ctx, "DELETE FROM route_coverage_logs WHERE vehicle_id = $1 AND route_id = $2 AND report_date = $3", vehicleID, routeID, dateStr)
	resReasons, errReasons := tx.Exec(ctx, "DELETE FROM route_coverage_miss_reasons WHERE vehicle_id = $1 AND route_id = $2 AND report_date = $3", vehicleID, routeID, dateStr)

	rowsDeletedLogs := int64(0)
	if errLogs == nil {
		rowsDeletedLogs = resLogs.RowsAffected()
	}
	rowsDeletedReasons := int64(0)
	if errReasons == nil {
		rowsDeletedReasons = resReasons.RowsAffected()
	}
	if dbg != nil {
		dbg.Log("[D2D][DELETE_EXISTING_LOGS] request_id=%s vehicle_id=%d rows_deleted_logs=%d rows_deleted_reasons=%d",
			requestID, vehicleID, rowsDeletedLogs, rowsDeletedReasons)
	}

	// 2. Batch insert physicalHits
	coverageLogsInserted := int64(0)
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
		resInsert, err := tx.Exec(ctx, query, vals...)
		if err != nil {
			log.Error().Err(err).Msg("Failed to batch insert coverage hits during recalculation")
			if dbg != nil {
				dbg.LogCritical(fmt.Sprintf("request_id=%s vehicle_id=%d event=INSERT_COVERAGE_LOGS_FAILED err=%q", requestID, vehicleID, err.Error()))
			}
			return
		}
		coverageLogsInserted = resInsert.RowsAffected()
	}
	if dbg != nil {
		dbg.Log("[D2D][INSERT_COVERAGE_LOGS] request_id=%s vehicle_id=%d coverage_logs_inserted=%d",
			requestID, vehicleID, coverageLogsInserted)
	}

	// 3. Batch insert miss reasons
	missReasonsInserted := int64(0)
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
		resInsert, err := tx.Exec(ctx, query, vals...)
		if err != nil {
			log.Error().Err(err).Msg("Failed to batch insert miss reasons during recalculation")
			if dbg != nil {
				dbg.LogCritical(fmt.Sprintf("request_id=%s vehicle_id=%d event=INSERT_MISS_REASONS_FAILED err=%q", requestID, vehicleID, err.Error()))
			}
			return
		}
		missReasonsInserted = resInsert.RowsAffected()
	}
	if dbg != nil {
		dbg.Log("[D2D][INSERT_MISS_REASONS] request_id=%s vehicle_id=%d miss_reasons_inserted=%d",
			requestID, vehicleID, missReasonsInserted)
	}

	log.Info().
		Int("vehicle_id", vehicleID).
		Int("route_id", routeID).
		Str("date", dateStr).
		Int("physical_hits_count", len(physicalHits)).
		Int("miss_reasons_count", len(missReasons)).
		Int("total_checkpoints", len(checkpoints)).
		Msg("D2D recalculation about to commit")

	errCommit := tx.Commit(ctx)
	success := (errCommit == nil)
	if success {
		committed = true
		if dbg != nil {
			var logsCount, reasonsCount int
			_ = gpsRepo.Pool().QueryRow(ctx, "SELECT COUNT(*) FROM route_coverage_logs WHERE vehicle_id = $1 AND route_id = $2 AND report_date = $3", vehicleID, routeID, dateStr).Scan(&logsCount)
			_ = gpsRepo.Pool().QueryRow(ctx, "SELECT COUNT(*) FROM route_coverage_miss_reasons WHERE vehicle_id = $1 AND route_id = $2 AND report_date = $3", vehicleID, routeID, dateStr).Scan(&reasonsCount)
			recomputedPct := 0.0
			totalCps := len(checkpoints)
			if totalCps > 0 {
				recomputedPct = float64(logsCount) / float64(totalCps) * 100.0
			}
			dbg.Log("[D2D][POST_COMMIT_VALIDATION] request_id=%s vehicle_id=%d coverage_logs_found=%d miss_reasons_found=%d coverage_percentage_recomputed=%.2f",
				requestID, vehicleID, logsCount, reasonsCount, recomputedPct)
		}
	}
}

func GetReportTypeForVehicleType(typeName string) string {
	lower := strings.ToLower(typeName)
	if strings.Contains(lower, "rcv") || strings.Contains(lower, "dumper") || 
	   strings.Contains(lower, "sweeping") || strings.Contains(lower, "road") || strings.Contains(lower, "clean") || 
	   strings.Contains(lower, "animal") || strings.Contains(lower, "rescue") || strings.Contains(lower, "crane") {
		return "SPECIAL_OPERATIONS"
	}
	return "VEHICLE_MOVEMENT"
}

func ResolveActiveShift(ctx context.Context, pool *pgxpool.Pool, group string, targetTime time.Time) (int, string, time.Time, time.Time, time.Time, error) {
	rows, err := pool.Query(ctx, `
		SELECT s.id, s.shift_name, 
		       COALESCE(s.start_time::text, ''), 
		       COALESCE(s.end_time::text, ''), 
		       COALESCE(s.time_duration, 0)
		FROM shifts s
		JOIN report_types rt ON s.report_type_id = rt.id
		WHERE s.is_active = true AND rt.name = $1
	`, group)
	if err != nil {
		return 0, "", targetTime, time.Time{}, time.Time{}, err
	}
	defer rows.Close()

	curMin := targetTime.Hour()*60 + targetTime.Minute()
	for rows.Next() {
		var id, duration int
		var name, startStr, endStr string
		if err := rows.Scan(&id, &name, &startStr, &endStr, &duration); err != nil {
			continue
		}

		var sh, sm, ss, eh, em, es int
		fmt.Sscanf(startStr, "%d:%d:%d", &sh, &sm, &ss)
		fmt.Sscanf(endStr, "%d:%d:%d", &eh, &em, &es)

		stMin := sh*60 + sm
		etMin := eh*60 + em

		isWithinShift := false
		var actualStart, actualEnd time.Time
		var opDate time.Time

		if stMin < etMin {
			// Normal shift within same day
			if curMin >= stMin && curMin <= etMin {
				isWithinShift = true
				opDate = targetTime
				actualStart = time.Date(targetTime.Year(), targetTime.Month(), targetTime.Day(), sh, sm, ss, 0, targetTime.Location())
				actualEnd = time.Date(targetTime.Year(), targetTime.Month(), targetTime.Day(), eh, em, es, 0, targetTime.Location())
			}
		} else {
			// Midnight crossing shift
			if curMin >= stMin || curMin <= etMin {
				isWithinShift = true
				if curMin >= stMin {
					opDate = targetTime
					actualStart = time.Date(targetTime.Year(), targetTime.Month(), targetTime.Day(), sh, sm, ss, 0, targetTime.Location())
					tomorrow := targetTime.Add(24 * time.Hour)
					actualEnd = time.Date(tomorrow.Year(), tomorrow.Month(), tomorrow.Day(), eh, em, es, 0, targetTime.Location())
				} else {
					opDate = targetTime.AddDate(0, 0, -1)
					yesterday := targetTime.Add(-24 * time.Hour)
					actualStart = time.Date(yesterday.Year(), yesterday.Month(), yesterday.Day(), sh, sm, ss, 0, targetTime.Location())
					actualEnd = time.Date(targetTime.Year(), targetTime.Month(), targetTime.Day(), eh, em, es, 0, targetTime.Location())
				}
			}
		}

		if isWithinShift {
			return id, name, opDate, actualStart, actualEnd, nil
		}
	}

	// Default fallback: return first active shift in the group
	var fallbackID int
	var fallbackName, startStr, endStr string
	err = pool.QueryRow(ctx, `
		SELECT s.id, s.shift_name, COALESCE(s.start_time::text, ''), COALESCE(s.end_time::text, '') 
		FROM shifts s
		JOIN report_types rt ON s.report_type_id = rt.id
		WHERE s.is_active = true AND rt.name = $1 
		ORDER BY s.id ASC LIMIT 1
	`, group).Scan(&fallbackID, &fallbackName, &startStr, &endStr)
	if err == nil {
		var sh, sm, ss, eh, em, es int
		fmt.Sscanf(startStr, "%d:%d:%d", &sh, &sm, &ss)
		fmt.Sscanf(endStr, "%d:%d:%d", &eh, &em, &es)
		actualStart := time.Date(targetTime.Year(), targetTime.Month(), targetTime.Day(), sh, sm, ss, 0, targetTime.Location())
		actualEnd := actualStart.Add(12 * time.Hour) // fallback
		return fallbackID, fallbackName, targetTime, actualStart, actualEnd, nil
	}

	return 0, "", targetTime, time.Time{}, time.Time{}, fmt.Errorf("no active shifts in group %s", group)
}

func ResolveSelectedShiftTimes(ctx context.Context, pool *pgxpool.Pool, shiftID int, selectedDate time.Time) (string, time.Time, time.Time, error) {
	var name, startStr, endStr string
	err := pool.QueryRow(ctx, `
		SELECT shift_name, COALESCE(start_time::text, ''), COALESCE(end_time::text, '') 
		FROM shifts WHERE id = $1
	`, shiftID).Scan(&name, &startStr, &endStr)
	if err != nil {
		return "", time.Time{}, time.Time{}, err
	}

	var sh, sm, ss, eh, em, es int
	fmt.Sscanf(startStr, "%d:%d:%d", &sh, &sm, &ss)
	fmt.Sscanf(endStr, "%d:%d:%d", &eh, &em, &es)

	stMin := sh*60 + sm
	etMin := eh*60 + em

	actualStart := time.Date(selectedDate.Year(), selectedDate.Month(), selectedDate.Day(), sh, sm, ss, 0, selectedDate.Location())
	var actualEnd time.Time
	if stMin < etMin {
		actualEnd = time.Date(selectedDate.Year(), selectedDate.Month(), selectedDate.Day(), eh, em, es, 0, selectedDate.Location())
	} else {
		tomorrow := selectedDate.Add(24 * time.Hour)
		actualEnd = time.Date(tomorrow.Year(), tomorrow.Month(), tomorrow.Day(), eh, em, es, 0, selectedDate.Location())
	}

	return name, actualStart, actualEnd, nil
}

func (h *Handler) GetShiftBasedOpsReport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	dateStr := r.URL.Query().Get("date")
	shiftGroup := r.URL.Query().Get("shift_group") // e.g. "SPECIAL_OPERATIONS", "ROAD_CLEANING", "ANIMAL_RESCUE", "RCV_OPERATIONS"
	shiftIDStr := r.URL.Query().Get("shift_id")
	forceRecalc := r.URL.Query().Get("force_recalc") == "true"

	if dateStr == "" {
		dateStr = utils.CurrentTimeInIndia().Format("2006-01-02")
	}
	if shiftGroup == "" {
		shiftGroup = "SPECIAL_OPERATIONS"
	}

	selectedDate, err := time.ParseInLocation("2006-01-02", dateStr, utils.IndianLocation)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid date format, use YYYY-MM-DD"})
		return
	}

	var shiftID int
	var shiftName string
	var opDate time.Time
	var actualStart, actualEnd time.Time

	if shiftIDStr != "" {
		shiftID, _ = strconv.Atoi(shiftIDStr)
		name, start, end, err := ResolveSelectedShiftTimes(ctx, h.gpsRepo.Pool(), shiftID, selectedDate)
		if err != nil {
			sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Failed to resolve shift: " + err.Error()})
			return
		}
		shiftName = name
		opDate = selectedDate
		actualStart = start
		actualEnd = end
	} else {
		// Only allow auto-detection for today's date
		todayStr := utils.CurrentTimeInIndia().Format("2006-01-02")
		if dateStr != todayStr {
			sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Shift selection is mandatory for historical dates."})
			return
		}

		now := utils.CurrentTimeInIndia()
		id, name, oDate, start, end, err := ResolveActiveShift(ctx, h.gpsRepo.Pool(), "SPECIAL_OPERATIONS", now)
		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to resolve active shift: " + err.Error()})
			return
		}
		shiftID = id
		shiftName = name
		opDate = oDate
		actualStart = start
		actualEnd = end
	}

	// Fetch all vehicles
	vehicles, err := h.vRepo.GetAll(ctx)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch vehicles: " + err.Error()})
		return
	}

	results := []map[string]interface{}{}

	for _, v := range vehicles {
		// Check report type for this vehicle
		if GetReportTypeForVehicleType(v.VehicleType.Name) != "SPECIAL_OPERATIONS" {
			continue
		}

		if v.GpsDevice == nil || v.GpsDevice.IMEI == "" {
			continue
		}

		// Check if route is assigned
		var routeID int
		var routeName string
		err := h.gpsRepo.Pool().QueryRow(ctx, `
			SELECT r.id, COALESCE(r.route_name, '')
			FROM vehicle_route_assignments vra
			JOIN routes r ON vra.route_id = r.id
			WHERE vra.vehicle_id = $1 AND vra.shift_id = $2 AND vra.is_active = true
			ORDER BY vra.assigned_date DESC, vra.id DESC LIMIT 1
		`, v.ID, shiftID).Scan(&routeID, &routeName)
		
		hasRoute := err == nil && routeID > 0

		var coveredPct *float64
		if hasRoute {
			// Query route checkpoints
			cps, err := h.routeRepo.GetCheckpointsByRoute(ctx, routeID)
			if err == nil && len(cps) > 0 {
				opDateStr := opDate.Format("2006-01-02")
				
				// Re-calculate if today, or if force is true, or if no logs exist
				isToday := opDateStr == utils.CurrentTimeInIndia().Format("2006-01-02")
				localForceRecalc := forceRecalc || isToday
				
				hasHistory := false
				if !localForceRecalc {
					hasHistory, _ = h.routeRepo.HasCoverageRecords(ctx, v.ID, routeID, opDateStr)
				}

				if localForceRecalc || !hasHistory {
					recalculateShiftCoverage(ctx, h.gpsRepo, h.routeRepo, v.ID, routeID, opDateStr, actualStart, actualEnd, h.routeEngine.RequireSequentialCheckpoints, h.routeEngine.MaxCheckpointSpeedKmh, v.GpsDevice.IMEI, nil)
				}

				// Query hits
				logs, err := h.routeRepo.GetCoverageHitLogs(ctx, v.ID, routeID, opDateStr)
				if err == nil {
					uniqueHits := make(map[int]bool)
					for _, log := range logs {
						uniqueHits[log.CheckpointID] = true
					}
					pct := math.Round((float64(len(uniqueHits)) / float64(len(cps))) * 100)
					coveredPct = &pct
				}
			}
		}

		// Calculate movement metrics
		gpsData, err := h.gpsRepo.GetByVehicle(ctx, v.ID, actualStart, actualEnd)
		
		var totalDistance float64
		var maxSpeed float64
		var totalIgnitionSec float64
		var idleSec float64

		isIgnitionOn := func(p decoder.AVLData) bool {
			return p.Ignition || p.Speed > 2
		}

		if err == nil && len(gpsData) > 0 {
			gpsData = smoothGpsData(gpsData)
			var lastOp *decoder.AVLData
			for i := 0; i < len(gpsData); i++ {
				p := gpsData[i]
				if p.Speed > maxSpeed {
					maxSpeed = p.Speed
				}
				if lastOp == nil {
					lastOp = &gpsData[i]
					continue
				}
				if utils.IsValidGPSTransition(*lastOp, p) {
					totalDistance += utils.Haversine(lastOp.Lat, lastOp.Lng, p.Lat, p.Lng)
					lastOp = &gpsData[i]
				}
			}

			// Ignition & Idle durations
			for i := 1; i < len(gpsData); i++ {
				prev := gpsData[i-1]
				curr := gpsData[i]
				prevOn := isIgnitionOn(prev)
				currOn := isIgnitionOn(curr)
				if prevOn && currOn {
					dt := curr.Time.Sub(prev.Time).Seconds()
					if dt > 0 && dt < 3600 {
						totalIgnitionSec += dt
					}
				}
				if currOn && curr.Speed == 0 {
					dt := curr.Time.Sub(prev.Time).Seconds()
					if dt > 0 && dt < 3600 {
						idleSec += dt
					}
				}
			}
		}

		// Query trip count
		var tripCount int
		_ = h.gpsRepo.Pool().QueryRow(ctx, `
			SELECT COUNT(*) FROM trips 
			WHERE vehicle_id = $1 AND start_time BETWEEN $2 AND $3
		`, v.ID, actualStart, actualEnd).Scan(&tripCount)

		runningSec := int(totalIgnitionSec - idleSec)
		if runningSec < 0 {
			runningSec = 0
		}

		runningHoursStr := formatDuration(runningSec)
		idleHoursStr := formatDuration(int(idleSec))
		engineHoursStr := formatDuration(int(totalIgnitionSec))

		var summary string
		if totalDistance > 0 {
			summary = fmt.Sprintf("Travelled %.2f km. Engine running for %s, idle for %s.", totalDistance, runningHoursStr, idleHoursStr)
		} else {
			summary = "No movement detected."
		}

		// If no route, assign appropriate defaults
		dispRouteName := routeName
		if !hasRoute {
			dispRouteName = "N/A"
		}

		results = append(results, map[string]interface{}{
			"vehicle_id":         v.ID,
			"registration_no":    v.RegistrationNo,
			"vehicle_type":       v.VehicleType.Name,
			"route_id":           routeID,
			"route_name":         dispRouteName,
			"covered_percentage": coveredPct,
			"distance_travelled": totalDistance,
			"trip_count":         tripCount,
			"running_hours":      runningHoursStr,
			"idle_hours":         idleHoursStr,
			"engine_hours":       engineHoursStr,
			"movement_summary":   summary,
			"imei":               v.GpsDevice.IMEI,
		})
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success":          true,
		"shift_id":         shiftID,
		"shift_name":       shiftName,
		"operational_date": opDate.Format("2006-01-02"),
		"start_time":       actualStart.Format(time.RFC3339),
		"end_time":         actualEnd.Format(time.RFC3339),
		"data":             results,
	})
}

func recalculateShiftCoverage(ctx context.Context, gpsRepo *repository.GPSRepository, routeRepo *repository.RouteRepository, vehicleID int, routeID int, dateStr string, startTime time.Time, endTime time.Time, requireSequential bool, maxSpeed float64, imei string, dbg *d2dDebugLogger) {
	requestID := "N/A"
	if dbg != nil {
		requestID = dbg.requestID
	}

	// Fetch checkpoints first
	checkpoints, err := routeRepo.GetCheckpointsByRoute(ctx, routeID)
	if err != nil {
		log.Error().Err(err).Msg("Failed to fetch checkpoints for route")
		if dbg != nil {
			dbg.LogCritical(fmt.Sprintf("request_id=%s vehicle_id=%d route_id=%d event=CHECKPOINTS_FETCH_FAILED err=%q", requestID, vehicleID, routeID, err.Error()))
		}
		return
	}

	if len(checkpoints) == 0 {
		return
	}

	// Fetch GPS data
	gpsData, err := gpsRepo.GetByVehicle(ctx, vehicleID, startTime, endTime)
	if err != nil {
		log.Error().Err(err).Msg("Failed to query GPS data for shift coverage calculation")
		return
	}

	if len(gpsData) == 0 {
		return
	}

	gpsData = smoothGpsData(gpsData)

	missReasons := make(map[int]string)
	for _, cp := range checkpoints {
		missReasons[cp.ID] = "Never Reached"
	}

	physicalHits := make(map[int]time.Time)

	// If we have GPS data, run segment checking and checkpoint hits detection
	if len(gpsData) > 0 {
		expectedIdx := 0 // index of the checkpoint we are currently looking for

		for idx, p := range gpsData {
			if p.Lat == 0.0 || p.Lng == 0.0 {
				continue
			}

			// Sequential checking logic (same as D2D recalculation)
			if requireSequential {
				if expectedIdx < len(checkpoints) {
					targetCP := checkpoints[expectedIdx]
					distKm := utils.Haversine(p.Lat, p.Lng, targetCP.Latitude, targetCP.Longitude)
					distMeters := distKm * 1000.0

					if distMeters <= targetCP.RadiusMeters {
						physicalHits[targetCP.ID] = p.Time
						delete(missReasons, targetCP.ID)
						expectedIdx++
					} else if idx > 0 {
						prev := gpsData[idx-1]
						if prev.Lat != 0.0 && prev.Lng != 0.0 {
							distSeg := distanceToSegment(targetCP.Latitude, targetCP.Longitude, prev.Lat, prev.Lng, p.Lat, p.Lng)
							if distSeg <= targetCP.RadiusMeters {
								physicalHits[targetCP.ID] = p.Time
								delete(missReasons, targetCP.ID)
								expectedIdx++
							}
						}
					}
				}
			} else {
				// Non-sequential checkpoint hitting logic
				for _, cp := range checkpoints {
					if _, hit := physicalHits[cp.ID]; hit {
						continue
					}
					distKm := utils.Haversine(p.Lat, p.Lng, cp.Latitude, cp.Longitude)
					distMeters := distKm * 1000.0

					if distMeters <= cp.RadiusMeters {
						physicalHits[cp.ID] = p.Time
						delete(missReasons, cp.ID)
					} else if idx > 0 {
						prev := gpsData[idx-1]
						if prev.Lat != 0.0 && prev.Lng != 0.0 {
							distSeg := distanceToSegment(cp.Latitude, cp.Longitude, prev.Lat, prev.Lng, p.Lat, p.Lng)
							if distSeg <= cp.RadiusMeters {
								physicalHits[cp.ID] = p.Time
								delete(missReasons, cp.ID)
							}
						}
					}
				}
			}
		}
	}

	// Database Transaction
	tx, errTx := gpsRepo.Pool().Begin(ctx)
	if errTx != nil {
		log.Error().Err(errTx).Msg("Failed to start transaction for shift recalculation")
		return
	}
	defer tx.Rollback(ctx)

	// Delete all existing logs and miss reasons for this vehicle, route, and date
	_, _ = tx.Exec(ctx, "DELETE FROM route_coverage_logs WHERE vehicle_id = $1 AND route_id = $2 AND report_date = $3", vehicleID, routeID, dateStr)
	_, _ = tx.Exec(ctx, "DELETE FROM route_coverage_miss_reasons WHERE vehicle_id = $1 AND route_id = $2 AND report_date = $3", vehicleID, routeID, dateStr)

	// Batch insert physicalHits
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
		_, err := tx.Exec(ctx, query, vals...)
		if err != nil {
			log.Error().Err(err).Msg("Failed to batch insert coverage hits during shift recalculation")
			return
		}
	}

	// Batch insert miss reasons
	if len(missReasons) > 0 {
		query := "INSERT INTO route_coverage_miss_reasons (vehicle_id, route_id, checkpoint_id, report_date, reason) VALUES "
		vals := []interface{}{}
		for cpID, reason := range missReasons {
			idx := len(vals)
			query += fmt.Sprintf("($%d, $%d, $%d, $%d, $%d),", idx+1, idx+2, idx+3, idx+4, idx+5)
			vals = append(vals, vehicleID, routeID, cpID, dateStr, reason)
		}
		query = query[:len(query)-1] // trim trailing comma
		query += " ON CONFLICT (vehicle_id, route_id, checkpoint_id, report_date) DO NOTHING"
		_, err := tx.Exec(ctx, query, vals...)
		if err != nil {
			log.Error().Err(err).Msg("Failed to batch insert miss reasons during shift recalculation")
			return
		}
	}

	_ = tx.Commit(ctx)
}

func formatDuration(seconds int) string {
	h := seconds / 3600
	m := (seconds % 3600) / 60
	s := seconds % 60
	return fmt.Sprintf("%02d:%02d:%02d", h, m, s)
}
