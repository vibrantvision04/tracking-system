package api

import (
	"context"
	"net/http"
	"strconv"
	"sync"
	"time"

	"gps-tracking-system/internal/decoder"
	"gps-tracking-system/internal/geofence"
	"gps-tracking-system/internal/utils"

	"github.com/rs/zerolog/log"
)

type VehicleSummaryReportRow struct {
	VehicleID                int     `json:"vehicle_id"`
	VehicleReg               string  `json:"vehicle_reg"`
	VehicleType              string  `json:"vehicle_type"`
	ZoneName                 string  `json:"zone_name"`
	WardName                 string  `json:"ward_name"`
	TotalDistance            float64 `json:"total_distance"`
	TransferStationTrips    int     `json:"transfer_station_trips"`
	CoveredPercentage        float64 `json:"covered_percentage"`
	InOrderCoveredPercentage float64 `json:"inorder_covered_percentage"`
}

func (h *Handler) GetVehicleSummaryReport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	// Parse optional filters
	zoneIDStr := r.URL.Query().Get("zone_id")
	var zoneID *int
	if zoneIDStr != "" && zoneIDStr != "null" {
		if id, err := strconv.Atoi(zoneIDStr); err == nil && id > 0 {
			zoneID = &id
		}
	}

	wardIDStr := r.URL.Query().Get("ward_id")
	var wardID *int
	if wardIDStr != "" && wardIDStr != "null" {
		if id, err := strconv.Atoi(wardIDStr); err == nil && id > 0 {
			wardID = &id
		}
	}

	shiftIDStr := r.URL.Query().Get("shift_id")
	var shiftID *int
	if shiftIDStr != "" && shiftIDStr != "null" {
		if id, err := strconv.Atoi(shiftIDStr); err == nil && id > 0 {
			shiftID = &id
		}
	}

	routeTypeIDStr := r.URL.Query().Get("route_type_id")
	var routeTypeID *int
	if routeTypeIDStr != "" && routeTypeIDStr != "null" {
		if id, err := strconv.Atoi(routeTypeIDStr); err == nil && id > 0 {
			routeTypeID = &id
		}
	}

	routeIDStr := r.URL.Query().Get("route_id")
	var routeID *int
	if routeIDStr != "" && routeIDStr != "null" {
		if id, err := strconv.Atoi(routeIDStr); err == nil && id > 0 {
			routeID = &id
		}
	}

	dateStr := r.URL.Query().Get("date")
	if dateStr == "" {
		dateStr = utils.CurrentTimeInIndia().Format("2006-01-02")
	}
	reportDate, err := time.ParseInLocation("2006-01-02", dateStr, utils.IndianLocation)
	if err != nil {
		reportDate = utils.CurrentTimeInIndia()
		dateStr = reportDate.Format("2006-01-02")
	}

	dayStart := time.Date(reportDate.Year(), reportDate.Month(), reportDate.Day(), 0, 0, 0, 0, utils.IndianLocation)
	dayEnd := dayStart.Add(24 * time.Hour)

	// Fetch all transfer stations once for GTS trip calculation
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

	// 1. Resolve active/matched vehicles to trigger recalculations first
	resolveQuery := `
		SELECT 
			v.id, 
			COALESCE(v.registration_no, ''), 
			COALESCE(z.region_name, 'Unknown Zone'), 
			COALESCE(w.region_name, 'Unknown Ward'),
			COALESCE(vra.route_id, c_fallback.route_id, r_name.id) as route_id
		FROM vehicles v
		LEFT JOIN LATERAL (
			SELECT route_id FROM vehicle_route_assignments
			WHERE vehicle_id = v.id AND is_active = true
			ORDER BY assigned_date DESC, id DESC LIMIT 1
		) vra ON true
		LEFT JOIN LATERAL (
			SELECT route_id FROM vehicle_lane_point_coverage
			WHERE vehicle_id = v.id AND report_date = $1::date
			LIMIT 1
		) c_fallback ON true
		LEFT JOIN LATERAL (
			SELECT id FROM routes
			WHERE is_active = true AND route_name ILIKE '%' || v.registration_no || '%'
			LIMIT 1
		) r_name ON true
		LEFT JOIN LATERAL (
			SELECT ward_id FROM route_wards rw 
			WHERE route_id = COALESCE(vra.route_id, c_fallback.route_id, r_name.id) 
			LIMIT 1
		) rw ON true
		LEFT JOIN vehicle_regions vr ON v.id = vr.vehicle_id
		LEFT JOIN regions z ON COALESCE(vr.region_id, v.zone_id) = z.id AND z.region_type_id = 2
		LEFT JOIN regions w ON COALESCE(rw.ward_id, v.ward_id) = w.id AND w.region_type_id = 3
		WHERE v.is_active = true
		  AND ($2::int IS NULL OR COALESCE(vr.region_id, v.zone_id) = $2)
		  AND ($3::int IS NULL OR COALESCE(rw.ward_id, v.ward_id) = $3)
		  AND ($4::int IS NULL OR COALESCE(vra.route_id, c_fallback.route_id, r_name.id) = $4)
	`

	resRows, err := db.Query(ctx, resolveQuery, dateStr, zoneID, wardID, routeID)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to resolve vehicles: " + err.Error()})
		return
	}

	type ResolvedVehicle struct {
		ID             int
		RegistrationNo string
		ZoneName       string
		WardName       string
		RouteID        *int
	}

	var resolvedVehicles []ResolvedVehicle
	for resRows.Next() {
		var rv ResolvedVehicle
		if err := resRows.Scan(&rv.ID, &rv.RegistrationNo, &rv.ZoneName, &rv.WardName, &rv.RouteID); err == nil {
			resolvedVehicles = append(resolvedVehicles, rv)
		}
	}
	resRows.Close()

	// On-the-fly generation/recalculation of distance and coverage if missing or today
	isToday := (dateStr == utils.CurrentTimeInIndia().Format("2006-01-02"))
	var wgRecalc sync.WaitGroup
	for _, rv := range resolvedVehicles {
		wgRecalc.Add(1)
		go func(rv ResolvedVehicle) {
			defer wgRecalc.Done()

			// Check if movement report exists
			var hasReport bool
			_ = db.QueryRow(context.Background(), "SELECT EXISTS(SELECT 1 FROM movement_reports WHERE vehicle_id = $1 AND report_date = $2)", rv.ID, dateStr).Scan(&hasReport)

			if isToday || !hasReport {
				// Generate daily movement report
				_ = h.rService.GenerateDailyReport(context.Background(), rv.ID, reportDate, rv.ZoneName, rv.WardName)

				// Recalculate route coverage if route is resolved
				if rv.RouteID != nil {
					_ = RecalculateLanePointCoverage(context.Background(), h.gpsRepo, h.routeRepo, rv.ID, *rv.RouteID, dateStr, 50.0, false)
				}
			}
		}(rv)
	}
	wgRecalc.Wait()

	// Bulk load GPS data for GTS trip calculation
	var allGPSData map[int][]decoder.AVLData
	if len(resolvedVehicles) > 0 {
		allGPSData, err = h.gpsRepo.GetAllByTimeWindow(ctx, dayStart, dayEnd)
		if err != nil {
			log.Error().Err(err).Msg("Failed to query GPS data in bulk for summary report")
			allGPSData = make(map[int][]decoder.AVLData)
		}
	} else {
		allGPSData = make(map[int][]decoder.AVLData)
	}

	// Bulk load checkpoints for assigned routes
	routeIDs := []int{}
	routeIDMap := make(map[int]bool)
	for _, rv := range resolvedVehicles {
		if rv.RouteID != nil {
			if !routeIDMap[*rv.RouteID] {
				routeIDMap[*rv.RouteID] = true
				routeIDs = append(routeIDs, *rv.RouteID)
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
		}
	}

	// 2. Fetch the final summary data (which is now guaranteed to be updated/cached in DB)
	finalQuery := `
		WITH resolved_vehicles AS (
			SELECT 
				v.id as vehicle_id,
				v.registration_no,
				v.vehicle_type_id,
				COALESCE(vr.region_id, v.zone_id) as zone_id,
				COALESCE(rw.ward_id, v.ward_id) as ward_id,
				COALESCE(vra.route_id, c_fallback.route_id, r_name.id) as route_id,
				COALESCE(r.route_type_id, r_fallback.route_type_id, r_name.route_type_id) as route_type_id,
				COALESCE(r.shift_id, r_fallback.shift_id, r_name.shift_id) as shift_id,
				g_ward.polygon as ward_polygon,
				d.imei
			FROM vehicles v
			LEFT JOIN LATERAL (
				SELECT route_id, shift_id, assigned_date FROM vehicle_route_assignments
				WHERE vehicle_id = v.id AND is_active = true
				ORDER BY assigned_date DESC, id DESC LIMIT 1
			) vra ON true
			LEFT JOIN routes r ON vra.route_id = r.id
			LEFT JOIN LATERAL (
				SELECT route_id FROM vehicle_lane_point_coverage
				WHERE vehicle_id = v.id AND report_date = $1::date
				LIMIT 1
			) c_fallback ON true
			LEFT JOIN routes r_fallback ON c_fallback.route_id = r_fallback.id
			LEFT JOIN LATERAL (
				SELECT id, route_type_id, shift_id FROM routes
				WHERE is_active = true AND route_name ILIKE '%' || v.registration_no || '%'
				LIMIT 1
			) r_name ON true
			LEFT JOIN LATERAL (
				SELECT ward_id FROM route_wards rw 
				WHERE route_id = COALESCE(vra.route_id, c_fallback.route_id, r_name.id) 
				LIMIT 1
			) rw ON true
			LEFT JOIN regions w ON COALESCE(rw.ward_id, v.ward_id) = w.id
			LEFT JOIN geofences g_ward ON w.geofence_id = g_ward.id
			LEFT JOIN vehicle_regions vr ON v.id = vr.vehicle_id
			LEFT JOIN LATERAL (
				SELECT device_id FROM vehicle_gps_map 
				WHERE vehicle_id = v.id AND unassigned_at IS NULL 
				ORDER BY assigned_at DESC LIMIT 1
			) m ON true
			LEFT JOIN gps_devices d ON m.device_id = d.id
			WHERE v.is_active = true
			  AND ($2::int IS NULL OR COALESCE(vr.region_id, v.zone_id) = $2)
			  AND ($3::int IS NULL OR COALESCE(rw.ward_id, v.ward_id) = $3)
			  AND ($4::int IS NULL OR COALESCE(r.shift_id, r_fallback.shift_id, r_name.shift_id) = $4)
			  AND ($5::int IS NULL OR COALESCE(r.route_type_id, r_fallback.route_type_id, r_name.route_type_id) = $5)
			  AND ($6::int IS NULL OR COALESCE(vra.route_id, c_fallback.route_id, r_name.id) = $6)
		)
		SELECT 
			rv.vehicle_id,
			rv.registration_no as vehicle_reg,
			COALESCE(vt.vehicle_type_name, 'Hopper Tipper') as vehicle_type,
			COALESCE(z.region_name, 'Unknown Zone') as zone_name,
			COALESCE(w.region_name, 'Unknown Ward') as ward_name,
			COALESCE(mr.total_distance, 0.0) as total_distance,
			COALESCE(c.coverage_percent, 0.0) as covered_percentage,
			COALESCE(
				CASE 
					WHEN c.in_order = true THEN c.coverage_percent 
					ELSE 0.0 
				END, 0.0
			) as inorder_covered_percentage,
			rv.route_id,
			rv.ward_polygon,
			rv.imei
		FROM resolved_vehicles rv
		LEFT JOIN vehicle_types_vswm vt ON rv.vehicle_type_id = vt.id
		LEFT JOIN regions z ON rv.zone_id = z.id AND z.region_type_id = 2
		LEFT JOIN regions w ON rv.ward_id = w.id AND w.region_type_id = 3
		LEFT JOIN movement_reports mr ON rv.vehicle_id = mr.vehicle_id AND mr.report_date = $1::date
		LEFT JOIN vehicle_lane_point_coverage c ON rv.vehicle_id = c.vehicle_id AND rv.route_id = c.route_id AND c.report_date = $1::date
		ORDER BY rv.registration_no ASC
	`

	rows, err := db.Query(ctx, finalQuery, dateStr, zoneID, wardID, shiftID, routeTypeID, routeID)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query final summary report: " + err.Error()})
		return
	}
	defer rows.Close()

	type IntermediateRow struct {
		Row         VehicleSummaryReportRow
		RouteID     *int
		WardPolygon []byte
		Imei        string
	}

	var intermediateRows []IntermediateRow
	for rows.Next() {
		var ir IntermediateRow
		err := rows.Scan(
			&ir.Row.VehicleID,
			&ir.Row.VehicleReg,
			&ir.Row.VehicleType,
			&ir.Row.ZoneName,
			&ir.Row.WardName,
			&ir.Row.TotalDistance,
			&ir.Row.CoveredPercentage,
			&ir.Row.InOrderCoveredPercentage,
			&ir.RouteID,
			&ir.WardPolygon,
			&ir.Imei,
		)
		if err == nil {
			intermediateRows = append(intermediateRows, ir)
		}
	}

	// 3. Process GTS Trips chronologically in parallel using the shared helper
	var wgTrips sync.WaitGroup
	var finalData []VehicleSummaryReportRow = make([]VehicleSummaryReportRow, len(intermediateRows))

	for idx, ir := range intermediateRows {
		wgTrips.Add(1)
		go func(idx int, ir IntermediateRow) {
			defer wgTrips.Done()

			// Parse Ward Geofence polygon points
			var wardPolygonPoints []geofence.Point
			if len(ir.WardPolygon) > 0 {
				coords, err := parsePolygonCoordinates(ir.WardPolygon)
				if err == nil {
					for _, c := range coords {
						if len(c) >= 2 {
							wardPolygonPoints = append(wardPolygonPoints, geofence.Point{Lng: c[0], Lat: c[1]})
						}
					}
				}
			}

			// Get Route Checkpoints
			var checkpoints []RouteCheckpointInfo
			if ir.RouteID != nil {
				checkpoints = checkpointsMap[*ir.RouteID]
			}

			// Get GPS data
			gpsData := allGPSData[ir.Row.VehicleID]
			gpsData = smoothGpsData(gpsData)

			// Calculate validated GTS trips using the shared helper
			tripCount, _, _ := CalculateValidatedGTSTrips(gpsData, wardPolygonPoints, checkpoints, transferStations)

			// Set and assign to final row
			row := ir.Row
			row.TransferStationTrips = tripCount
			finalData[idx] = row
		}(idx, ir)
	}
	wgTrips.Wait()

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    finalData,
	})
}
