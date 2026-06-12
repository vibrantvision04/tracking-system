package api

import (
	"fmt"
	"net/http"
	"strconv"
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

	results := make([]GTSTripReportRow, 0)

	// Process each vehicle chronologically
	for _, task := range tasks {
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

		// 2. Fetch Route Checkpoints if route is assigned
		var checkpoints []RouteCheckpointInfo
		if task.RouteID != nil {
			cpRows, err := db.Query(ctx, `
				SELECT id, latitude, longitude, radius_meters, sequence_order
				FROM route_checkpoints
				WHERE route_id = $1
				ORDER BY sequence_order ASC
			`, *task.RouteID)
			if err == nil {
				for cpRows.Next() {
					var cp RouteCheckpointInfo
					if err := cpRows.Scan(&cp.ID, &cp.Latitude, &cp.Longitude, &cp.RadiusMeters, &cp.SequenceOrder); err == nil {
						checkpoints = append(checkpoints, cp)
					}
				}
				cpRows.Close()
			}
		}

		// 3. Fetch historical GPS data for this vehicle
		gpsData, err := h.gpsRepo.GetByVehicle(ctx, task.ID, dayStart, dayEnd)
		if err != nil {
			log.Error().Err(err).Int("vehicle_id", task.ID).Msg("Failed to query GPS data for GTS Trip report")
			continue
		}

		// Smooth data
		gpsData = smoothGpsData(gpsData)
		if len(gpsData) == 0 {
			// No data, trip count is 0
			results = append(results, GTSTripReportRow{
				VehicleID:        task.ID,
				RegistrationNo:   task.RegistrationNo,
				ZoneName:         task.ZoneName,
				WardName:         task.WardName,
				TripCount:        0,
				RejectedCount:    0,
				RejectionReasons: []string{"No GPS data available"},
			})
			continue
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

		var prevPt *decoder.AVLData

		for idx, pt := range gpsData {
			isLastPoint := idx == len(gpsData)-1

			// Check if cooldown timer has completed
			cooldownComplete := cooldownUntil == nil || pt.Time.After(*cooldownUntil) || pt.Time.Equal(*cooldownUntil)

			// --- WARD STAY TIME VALIDATION ---
			isInsideWard := false
			if len(wardPolygonPoints) > 0 {
				isInsideWard = geofence.PointInPolygon(geofence.Point{Lat: pt.Lat, Lng: pt.Lng}, wardPolygonPoints)
			} else {
				// Fallback if ward has no geofence: treat as inside ward
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

			// --- ROUTE ACTIVITY VALIDATION ---
			// Check if within any checkpoint
			isOnRoute := false
			for _, cp := range checkpoints {
				distToCP := utils.Haversine(pt.Lat, pt.Lng, cp.Latitude, cp.Longitude) * 1000.0
				if distToCP <= cp.RadiusMeters {
					laneCheckpointsValidated[cp.ID] = true
					isOnRoute = true
				}
			}

			// Calculate route distance covered (speed > 3 km/h on route)
			if pt.Speed > 3.0 && prevPt != nil {
				dist := utils.Haversine(prevPt.Lat, prevPt.Lng, pt.Lat, pt.Lng) // in km
				if len(checkpoints) == 0 {
					// Fallback: if no checkpoints, any movement inside ward is route activity
					if isInsideWard {
						routeDistanceCovered += dist
					}
				} else {
					// Otherwise, must be near a checkpoint to count as on the route
					if isOnRoute {
						routeDistanceCovered += dist
					}
				}
			}

			// --- ELIGIBILITY EVALUATION ---
			if tripCount == 0 {
				// Phase 1 Eligibility Rules
				routeActivitySatisfied := len(checkpoints) == 0 || len(laneCheckpointsValidated) >= 1
				if insideWardDuration >= 10*time.Minute && routeActivitySatisfied && routeDistanceCovered > 0 {
					eligibleForDump = true
				}
			} else {
				// Phase 4 Eligibility Rules
				wardTimeSatisfied := insideWardDuration >= 10*time.Minute
				routeActivitySatisfied := len(checkpoints) == 0 || len(laneCheckpointsValidated) >= 1 || routeDistanceCovered > 0
				if cooldownComplete && wardTimeSatisfied && routeActivitySatisfied {
					eligibleForDump = true
				}
			}

			// --- TRANSFER STATION SESSION TRACKING ---
			// Check if inside any transfer station geofence
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
				// Phase 2 Entry Validation: Session starts on entry
				sessionActive = true
				sessionMaxSpeed = pt.Speed
				sessionTouchedDump = false
				sessionMaxContinuousIgnitionOnTime = 0
				sessionTSID = enteredTS.ID
				if pt.Ignition {
					t := pt.Time
					sessionIgnitionOnStartTime = &t
				} else {
					sessionIgnitionOnStartTime = nil
				}
			}

			if sessionActive {
				// We are in a session. Check if still in the same TS
				stillInTS := enteredTS != nil && enteredTS.ID == sessionTSID

				if stillInTS {
					// Inside. Update stats
					if pt.Speed > sessionMaxSpeed {
						sessionMaxSpeed = pt.Speed
					}
					
					// Update continuous ignition ON time
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
						// Ignition turned OFF: reset the count of 60 seconds and finalize current continuous block
						if sessionIgnitionOnStartTime != nil {
							stretchDuration := pt.Time.Sub(*sessionIgnitionOnStartTime)
							if stretchDuration > sessionMaxContinuousIgnitionOnTime {
								sessionMaxContinuousIgnitionOnTime = stretchDuration
							}
							sessionIgnitionOnStartTime = nil
						}
					}

					// Check if touches dump zone boundary
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

				// Exit trigger: left TS geofence or end of day
				if !stillInTS || isLastPoint {
					sessionActive = false
					
					// Finalize continuous ignition ON duration if it was still active
					if sessionIgnitionOnStartTime != nil {
						stretchDuration := pt.Time.Sub(*sessionIgnitionOnStartTime)
						if stretchDuration > sessionMaxContinuousIgnitionOnTime {
							sessionMaxContinuousIgnitionOnTime = stretchDuration
						}
					}

					minStayPassed := sessionMaxContinuousIgnitionOnTime >= 60*time.Second
					speedValid := true // Temporarily removed 5 km/h limitation as per user request
					dumpZoneValid := sessionTouchedDump

					if eligibleForDump && minStayPassed && speedValid && dumpZoneValid {
						// VALID TRIP!
						tripCount++

						// Start Phase 3 Cooldown (20 minutes)
						cooldownEnd := pt.Time.Add(20 * time.Minute)
						cooldownUntil = &cooldownEnd

						// Reset state for subsequent trip checks
						eligibleForDump = false
						insideWardDuration = 0
						laneCheckpointsValidated = make(map[int]bool)
						routeDistanceCovered = 0.0
					} else {
						// REJECTED TRIP
						rejectedCount++
						reasonStr := fmt.Sprintf("[%s] Rejected: ", pt.Time.Format("15:04"))
						var rList []string
						if !eligibleForDump {
							rList = append(rList, "Not eligible (ward stay < 10m or no route activity)")
						}
						if !minStayPassed {
							rList = append(rList, fmt.Sprintf("Ignition ON < 60s (was %ds)", int(sessionMaxContinuousIgnitionOnTime.Seconds())))
						}
						// Speed validation removed
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

			// Save previous point reference
			currPt := pt
			prevPt = &currPt
		}

		results = append(results, GTSTripReportRow{
			VehicleID:        task.ID,
			RegistrationNo:   task.RegistrationNo,
			ZoneName:         task.ZoneName,
			WardName:         task.WardName,
			TripCount:        tripCount,
			RejectedCount:    rejectedCount,
			RejectionReasons: rejectionReasons,
		})
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    results,
	})
}
