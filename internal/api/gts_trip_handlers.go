package api

import (
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"time"

	"gps-tracking-system/internal/decoder"
	"gps-tracking-system/internal/geofence"
	"gps-tracking-system/internal/utils"

	"github.com/rs/zerolog/log"
)

type GTSTripReportRow struct {
	VehicleID        int      `json:"vehicle_id"`
	RegistrationNo   string   `json:"registration_no"`
	ZoneName         string   `json:"zone_name"`
	WardName         string   `json:"ward_name"`
	TripCount        int      `json:"trip_count"`
	RejectedCount    int      `json:"rejected_count"`
	RejectionReasons []string `json:"rejection_reasons"`
}

type TransferStationInfo struct {
	ID            int
	Name          string
	DumpZoneLat   float64
	DumpZoneLng   float64
	DumpZoneRad   float64
	EntryLat      float64
	EntryLng      float64
	ExitLat       float64
	ExitLng       float64
	PolygonPoints []geofence.Point
}

type RouteCheckpointInfo struct {
	ID             int
	Latitude       float64
	Longitude      float64
	RadiusMeters   float64
	SequenceOrder  int
}

func (h *Handler) GetGTSTripReport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	// Parse date filter
	dateStr := r.URL.Query().Get("date")
	if dateStr == "" {
		dateStr = utils.CurrentTimeInIndia().Format("2006-01-02")
	}
	dayStart, err := time.ParseInLocation("2006-01-02", dateStr, utils.IndianLocation)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid date format, use YYYY-MM-DD"})
		return
	}
	dayEnd := dayStart.Add(24 * time.Hour)

	// Fetch all transfer stations
	tsRows, err := db.Query(ctx, `
		SELECT 
			ts.id, 
			ts.name, 
			COALESCE(ts.dump_zone_latitude, 0.0), 
			COALESCE(ts.dump_zone_longitude, 0.0), 
			COALESCE(ts.dump_zone_radius, 0.0), 
			COALESCE(ts.entry_latitude, 0.0), 
			COALESCE(ts.entry_longitude, 0.0), 
			COALESCE(ts.exit_latitude, 0.0), 
			COALESCE(ts.exit_longitude, 0.0),
			g.polygon
		FROM transfer_stations ts
		LEFT JOIN geofences g ON ts.geofence_id = g.id
	`)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch transfer stations: " + err.Error()})
		return
	}
	defer tsRows.Close()

	var transferStations []TransferStationInfo
	for tsRows.Next() {
		var ts TransferStationInfo
		var polyJSON []byte
		err := tsRows.Scan(
			&ts.ID, &ts.Name, &ts.DumpZoneLat, &ts.DumpZoneLng, &ts.DumpZoneRad,
			&ts.EntryLat, &ts.EntryLng, &ts.ExitLat, &ts.ExitLng, &polyJSON,
		)
		if err == nil {
			if len(polyJSON) > 0 {
				coords, err := parsePolygonCoordinates(polyJSON)
				if err == nil {
					for _, c := range coords {
						if len(c) >= 2 {
							ts.PolygonPoints = append(ts.PolygonPoints, geofence.Point{Lng: c[0], Lat: c[1]})
						}
					}
				}
			}
			transferStations = append(transferStations, ts)
		}
	}

	// Parse lookup/filtering parameters
	filterVehicleID, _ := strconv.Atoi(r.URL.Query().Get("vehicle_id"))
	filterZoneID, _ := strconv.Atoi(r.URL.Query().Get("zone_id"))
	filterWardID, _ := strconv.Atoi(r.URL.Query().Get("ward_id"))
	filterRouteTypeID, _ := strconv.Atoi(r.URL.Query().Get("route_type_id"))

	// Build query for vehicles with active ward/route assignments
	query := `
		SELECT 
			v.id, 
			COALESCE(v.registration_no, ''), 
			COALESCE(w.id, 0) AS ward_id, 
			COALESCE(w.region_name, ''), 
			COALESCE(z.region_name, '') AS zone_name,
			g_ward.polygon,
			vra.route_id
		FROM vehicles v
		LEFT JOIN vehicle_regions vr ON v.id = vr.vehicle_id
		LEFT JOIN regions z ON COALESCE(vr.region_id, v.zone_id) = z.id AND z.region_type_id = 2
		LEFT JOIN (
			SELECT DISTINCT ON (vehicle_id) vehicle_id, route_id
			FROM vehicle_route_assignments
			WHERE is_active = true
			ORDER BY vehicle_id, assigned_date DESC, id DESC
		) vra ON v.id = vra.vehicle_id
		LEFT JOIN routes r ON vra.route_id = r.id
		LEFT JOIN LATERAL (SELECT ward_id FROM route_wards rw WHERE route_id = vra.route_id LIMIT 1) rw ON true
		LEFT JOIN regions w ON COALESCE(rw.ward_id, v.ward_id) = w.id AND w.region_type_id = 3
		LEFT JOIN geofences g_ward ON w.geofence_id = g_ward.id
		WHERE 1=1
	`
	args := []interface{}{}
	argIdx := 1

	if filterVehicleID > 0 {
		query += fmt.Sprintf(" AND v.id = $%d", argIdx)
		args = append(args, filterVehicleID)
		argIdx++
	}
	if filterWardID > 0 {
		query += fmt.Sprintf(" AND w.id = $%d", argIdx)
		args = append(args, filterWardID)
		argIdx++
	}
	if filterZoneID > 0 {
		query += fmt.Sprintf(" AND z.id = $%d", argIdx)
		args = append(args, filterZoneID)
		argIdx++
	}
	if filterRouteTypeID > 0 {
		query += fmt.Sprintf(" AND r.route_type_id = $%d", argIdx)
		args = append(args, filterRouteTypeID)
		argIdx++
	}

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch vehicles: " + err.Error()})
		return
	}
	defer rows.Close()

	type VehicleTask struct {
		ID             int
		RegistrationNo string
		WardID         int
		WardName       string
		ZoneName       string
		WardPolygon    []byte
		RouteID        *int
	}

	var tasks []VehicleTask
	for rows.Next() {
		var t VehicleTask
		err := rows.Scan(
			&t.ID, &t.RegistrationNo, &t.WardID, &t.WardName, &t.ZoneName, &t.WardPolygon, &t.RouteID,
		)
		if err == nil {
			tasks = append(tasks, t)
		}
	}

	// Bulk load GPS data for all matching vehicles
	var allGPSData map[int][]decoder.AVLData
	if len(tasks) > 0 {
		if filterVehicleID > 0 {
			singleData, err := h.gpsRepo.GetByVehicle(ctx, filterVehicleID, dayStart, dayEnd)
			if err != nil {
				log.Error().Err(err).Int("vehicle_id", filterVehicleID).Msg("Failed to query GPS data for single vehicle")
			}
			allGPSData = map[int][]decoder.AVLData{
				filterVehicleID: singleData,
			}
		} else {
			allGPSData, err = h.gpsRepo.GetAllByTimeWindow(ctx, dayStart, dayEnd)
			if err != nil {
				log.Error().Err(err).Msg("Failed to query GPS data in bulk")
				sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch GPS data: " + err.Error()})
				return
			}
		}
	} else {
		allGPSData = make(map[int][]decoder.AVLData)
	}

	// Bulk load route checkpoints for all assigned routes
	routeIDs := []int{}
	routeIDMap := make(map[int]bool)
	for _, t := range tasks {
		if t.RouteID != nil {
			if !routeIDMap[*t.RouteID] {
				routeIDMap[*t.RouteID] = true
				routeIDs = append(routeIDs, *t.RouteID)
			}
		}
	}

	checkpointsMap := make(map[int][]RouteCheckpointInfo)
	if len(routeIDs) > 0 {
		cpQuery := `
			SELECT route_id, id, latitude, longitude, 10.0 as radius_meters, sequence_number
			FROM route_lane_points
			WHERE route_id = ANY($1)
			ORDER BY route_id, sequence_number ASC
		`
		cpRows, err := db.Query(ctx, cpQuery, routeIDs)
		if err == nil {
			defer cpRows.Close()
			for cpRows.Next() {
				var rID int
				var cp RouteCheckpointInfo
				if err := cpRows.Scan(&rID, &cp.ID, &cp.Latitude, &cp.Longitude, &cp.RadiusMeters, &cp.SequenceOrder); err == nil {
					checkpointsMap[rID] = append(checkpointsMap[rID], cp)
				}
			}
		} else {
			log.Error().Err(err).Msg("Failed to query route checkpoints in bulk")
		}
	}

	results := make([]GTSTripReportRow, len(tasks))
	var wg sync.WaitGroup

	for idx, task := range tasks {
		wg.Add(1)
		go func(idx int, task VehicleTask) {
			defer wg.Done()

			// 1. Parse Ward Geofence polygon points
			var wardPolygonPoints []geofence.Point
			if len(task.WardPolygon) > 0 {
				coords, err := parsePolygonCoordinates(task.WardPolygon)
				if err == nil {
					for _, c := range coords {
						if len(c) >= 2 {
							wardPolygonPoints = append(wardPolygonPoints, geofence.Point{Lng: c[0], Lat: c[1]})
						}
					}
				}
			}

			// 2. Get Route Checkpoints from the bulk map
			var checkpoints []RouteCheckpointInfo
			if task.RouteID != nil {
				checkpoints = checkpointsMap[*task.RouteID]
			}

			// 3. Get GPS data from the bulk map
			gpsData := allGPSData[task.ID]

			// Smooth data
			gpsData = smoothGpsData(gpsData)
			if len(gpsData) == 0 {
				results[idx] = GTSTripReportRow{
					VehicleID:        task.ID,
					RegistrationNo:   task.RegistrationNo,
					ZoneName:         task.ZoneName,
					WardName:         task.WardName,
					TripCount:        0,
					RejectedCount:    0,
					RejectionReasons: []string{"No GPS data available"},
				}
				return
			}

			// 4. Chronological State-Machine Validation Engine
			tripCount := 0
			rejectedCount := 0
			var rejectionReasons []string
			eligibleForDump := false
			var cooldownUntil *time.Time
			var lastInsideWardTime *time.Time
			var insideWardDuration time.Duration

			// Route activity state
			laneCheckpointsValidated := make(map[int]bool)
			routeDistanceCovered := 0.0

			// Transfer station session state
			sessionActive := false
			var sessionIgnitionOnStartTime *time.Time
			var sessionMaxContinuousIgnitionOnTime time.Duration
			var sessionMaxSpeed float64
			sessionTouchedDump := false
			sessionTSID := 0
			var sessionStartTime *time.Time

			var prevPt *decoder.AVLData

			for idx, pt := range gpsData {
				isLastPoint := idx == len(gpsData)-1
				cooldownComplete := cooldownUntil == nil || pt.Time.After(*cooldownUntil) || pt.Time.Equal(*cooldownUntil)

				// --- WARD STAY TIME VALIDATION ---
				isInsideWard := false
				if len(wardPolygonPoints) > 0 {
					isInsideWard = geofence.PointInPolygon(geofence.Point{Lat: pt.Lat, Lng: pt.Lng}, wardPolygonPoints)
				} else {
					isInsideWard = true
				}

				if isInsideWard {
					if lastInsideWardTime != nil {
						diff := pt.Time.Sub(*lastInsideWardTime)
						if diff < 15*time.Minute {
							insideWardDuration += diff
						}
					}
					t := pt.Time
					lastInsideWardTime = &t
				} else {
					lastInsideWardTime = nil
				}

				// Check if within any checkpoint
				for _, cp := range checkpoints {
					distToCP := utils.Haversine(pt.Lat, pt.Lng, cp.Latitude, cp.Longitude) * 1000.0
					if distToCP <= cp.RadiusMeters {
						laneCheckpointsValidated[cp.ID] = true
					}
				}

				// Calculate route distance covered
				if pt.Speed > 3.0 && prevPt != nil {
					dist := utils.Haversine(prevPt.Lat, prevPt.Lng, pt.Lat, pt.Lng)
					if isInsideWard {
						routeDistanceCovered += dist
					}
				}

				// --- ELIGIBILITY EVALUATION ---
				wardTimeSatisfied := insideWardDuration >= 10*time.Minute
				routeActivitySatisfied := false

				if len(checkpoints) > 0 {
					if len(laneCheckpointsValidated) >= 1 {
						routeActivitySatisfied = true
						wardTimeSatisfied = true
					} else {
						routeActivitySatisfied = routeDistanceCovered > 0
					}
				} else {
					routeActivitySatisfied = routeDistanceCovered > 0
				}

				if tripCount == 0 {
					if wardTimeSatisfied && routeActivitySatisfied {
						eligibleForDump = true
					}
				} else {
					if cooldownComplete && wardTimeSatisfied && routeActivitySatisfied {
						eligibleForDump = true
					}
				}

				// --- TRANSFER STATION SESSION TRACKING ---
				var enteredTS *TransferStationInfo
				for _, ts := range transferStations {
					if len(ts.PolygonPoints) > 0 {
						if geofence.PointInPolygon(geofence.Point{Lat: pt.Lat, Lng: pt.Lng}, ts.PolygonPoints) {
							enteredTS = &ts
							break
						}
					}
				}

				if !sessionActive && enteredTS != nil {
					sessionActive = true
					sessionMaxSpeed = pt.Speed
					sessionTouchedDump = false
					sessionMaxContinuousIgnitionOnTime = 0
					sessionTSID = enteredTS.ID
					tStart := pt.Time
					sessionStartTime = &tStart
					if pt.Ignition {
						t := pt.Time
						sessionIgnitionOnStartTime = &t
					} else {
						sessionIgnitionOnStartTime = nil
					}
				}

				if sessionActive {
					stillInTS := enteredTS != nil && enteredTS.ID == sessionTSID

					if stillInTS {
						if pt.Speed > sessionMaxSpeed {
							sessionMaxSpeed = pt.Speed
						}
						
						if pt.Ignition {
							if sessionIgnitionOnStartTime == nil {
								t := pt.Time
								sessionIgnitionOnStartTime = &t
							} else {
								currentDuration := pt.Time.Sub(*sessionIgnitionOnStartTime)
								if currentDuration > sessionMaxContinuousIgnitionOnTime {
									sessionMaxContinuousIgnitionOnTime = currentDuration
								}
							}
						} else {
							if sessionIgnitionOnStartTime != nil {
								stretchDuration := pt.Time.Sub(*sessionIgnitionOnStartTime)
								if stretchDuration > sessionMaxContinuousIgnitionOnTime {
									sessionMaxContinuousIgnitionOnTime = stretchDuration
								}
								sessionIgnitionOnStartTime = nil
							}
						}

						for _, ts := range transferStations {
							if ts.ID == sessionTSID {
								distToDump := utils.Haversine(pt.Lat, pt.Lng, ts.DumpZoneLat, ts.DumpZoneLng) * 1000.0
								if distToDump <= ts.DumpZoneRad {
									sessionTouchedDump = true
								}
								break
							}
						}
					}

					if !stillInTS || isLastPoint {
						sessionActive = false
						
						if sessionIgnitionOnStartTime != nil {
							stretchDuration := pt.Time.Sub(*sessionIgnitionOnStartTime)
							if stretchDuration > sessionMaxContinuousIgnitionOnTime {
								sessionMaxContinuousIgnitionOnTime = stretchDuration
							}
						}

						minStayPassed := sessionMaxContinuousIgnitionOnTime >= 60*time.Second
						speedValid := true
						dumpZoneValid := sessionTouchedDump

						var sessionDuration time.Duration
						if sessionStartTime != nil {
							sessionDuration = pt.Time.Sub(*sessionStartTime)
						}

						if eligibleForDump && minStayPassed && speedValid && dumpZoneValid {
							tripCount++
							cooldownEnd := pt.Time.Add(20 * time.Minute)
							cooldownUntil = &cooldownEnd
							eligibleForDump = false
							insideWardDuration = 0
							routeDistanceCovered = 0.0
						} else {
							if !dumpZoneValid && sessionDuration < 2*time.Minute {
								// Ignored
							} else {
								rejectedCount++
								reasonStr := fmt.Sprintf("[%s] Rejected: ", pt.Time.Format("15:04"))
								var rList []string
								if !eligibleForDump {
									rList = append(rList, "Not eligible (ward stay < 10m or no route activity)")
								}
								if !minStayPassed {
									rList = append(rList, fmt.Sprintf("Ignition ON < 60s (was %ds)", int(sessionMaxContinuousIgnitionOnTime.Seconds())))
								}
								if !dumpZoneValid {
									rList = append(rList, "Didn't touch dump zone radius")
								}
								if len(rList) > 0 {
									reasonStr += rList[0]
									for i := 1; i < len(rList); i++ {
										reasonStr += ", " + rList[i]
									}
								} else {
									reasonStr += "Unknown reason"
								}
								rejectionReasons = append(rejectionReasons, reasonStr)
							}
						}
					}
				}

				currPt := pt
				prevPt = &currPt
			}

			results[idx] = GTSTripReportRow{
				VehicleID:        task.ID,
				RegistrationNo:   task.RegistrationNo,
				ZoneName:         task.ZoneName,
				WardName:         task.WardName,
				TripCount:        tripCount,
				RejectedCount:    rejectedCount,
				RejectionReasons: rejectionReasons,
			}
		}(idx, task)
	}
	wg.Wait()

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    results,
	})
}
