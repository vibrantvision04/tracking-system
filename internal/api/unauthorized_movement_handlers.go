package api

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"gps-tracking-system/internal/decoder"
	"gps-tracking-system/internal/geofence"
	"gps-tracking-system/internal/utils"
)

type UnauthorizedMovementRow struct {
	VehicleID         int     `json:"vehicle_id"`
	RegistrationNo    string  `json:"registration_no"`
	VehicleType       string  `json:"vehicle_type"`
	DriverName        string  `json:"driver_name"`
	AssignedZone      string  `json:"assigned_zone"`
	AssignedWard      string  `json:"assigned_ward"`
	UnauthorizedStart string  `json:"unauthorized_start"`
	UnauthorizedEnd   string  `json:"unauthorized_end"`
	TotalDurationSec  int     `json:"total_duration_sec"`
	TotalDuration     string  `json:"total_duration"`
	Status            string  `json:"status"`
	Latitude          float64 `json:"latitude"`
	Longitude         float64 `json:"longitude"`
	LastGPSTime       string  `json:"last_gps_time"`
	TSTripCount       int     `json:"ts_trip_count"`
}

type vehAssign struct {
	vehicleID   int
	regNo       string
	vehicleType string
	zoneID      int
	zoneName    string
	wardID      int
	wardName    string
	zonePolygon []geofence.Point
	wardPolygon []geofence.Point
}

func (h *Handler) GetUnauthorizedMovementReport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	dateStr := r.URL.Query().Get("date")
	zoneIDStr := r.URL.Query().Get("zone_id")
	wardIDStr := r.URL.Query().Get("ward_id")
	vehicleIDStr := r.URL.Query().Get("vehicle_id")
	statusFilter := strings.ToLower(r.URL.Query().Get("status"))

	if dateStr == "" {
		dateStr = utils.CurrentTimeInIndia().Format("2006-01-02")
	}
	reportDate, err := time.ParseInLocation("2006-01-02", dateStr, utils.IndianLocation)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid date"})
		return
	}
	dayStart := time.Date(reportDate.Year(), reportDate.Month(), reportDate.Day(), 0, 0, 0, 0, utils.IndianLocation)
	dayEnd := dayStart.Add(24 * time.Hour)
	now := utils.CurrentTimeInIndia()
	isToday := dateStr == now.Format("2006-01-02")

	// Fetch all transfer stations with polygons
	tsRows, err := db.Query(ctx, `
		SELECT ts.id, ts.name,
			COALESCE(ts.dump_zone_latitude, 0.0), COALESCE(ts.dump_zone_longitude, 0.0),
			COALESCE(ts.dump_zone_radius, 0.0),
			COALESCE(ts.entry_latitude, 0.0), COALESCE(ts.entry_longitude, 0.0),
			COALESCE(ts.exit_latitude, 0.0), COALESCE(ts.exit_longitude, 0.0),
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
		if err := tsRows.Scan(&ts.ID, &ts.Name, &ts.DumpZoneLat, &ts.DumpZoneLng, &ts.DumpZoneRad,
			&ts.EntryLat, &ts.EntryLng, &ts.ExitLat, &ts.ExitLng, &polyJSON); err == nil {
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

	// Resolve vehicles with assigned zone/ward + geofence polygons
	var assignments []vehAssign

	query := `
		SELECT v.id, COALESCE(v.registration_no, ''), COALESCE(vt.vehicle_type_name, ''),
			COALESCE(z.id, 0), COALESCE(z.region_name, 'Unknown'),
			COALESCE(w.id, 0), COALESCE(w.region_name, 'Unknown'),
			COALESCE(gz.polygon, '{}'::jsonb), COALESCE(gw.polygon, '{}'::jsonb)
		FROM vehicles v
		LEFT JOIN vehicle_types_swift vt ON v.vehicle_type_id = vt.id
		LEFT JOIN regions z ON v.zone_id = z.id
		LEFT JOIN regions w ON v.ward_id = w.id
		LEFT JOIN geofences gz ON z.geofence_id = gz.id
		LEFT JOIN geofences gw ON w.geofence_id = gw.id
		WHERE v.is_active = true
	`
	var args []interface{}
	argIdx := 1
	if vehicleIDStr != "" {
		if vid, err := strconv.Atoi(vehicleIDStr); err == nil && vid > 0 {
			query += " AND v.id = $" + strconv.Itoa(argIdx)
			args = append(args, vid)
			argIdx++
		}
	}
	if zoneIDStr != "" {
		if zid, err := strconv.Atoi(zoneIDStr); err == nil && zid > 0 {
			query += " AND v.zone_id = $" + strconv.Itoa(argIdx)
			args = append(args, zid)
			argIdx++
		}
	}
	if wardIDStr != "" {
		if wid, err := strconv.Atoi(wardIDStr); err == nil && wid > 0 {
			query += " AND v.ward_id = $" + strconv.Itoa(argIdx)
			args = append(args, wid)
			argIdx++
		}
	}
	query += " ORDER BY v.id"

	vRows, err := db.Query(ctx, query, args...)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch vehicles: " + err.Error()})
		return
	}
	defer vRows.Close()

	for vRows.Next() {
		var a vehAssign
		var zonePolyJSON, wardPolyJSON []byte
		if err := vRows.Scan(&a.vehicleID, &a.regNo, &a.vehicleType,
			&a.zoneID, &a.zoneName, &a.wardID, &a.wardName,
			&zonePolyJSON, &wardPolyJSON); err != nil {
			continue
		}
		if len(zonePolyJSON) > 0 {
			if coords, err := parsePolygonCoordinates(zonePolyJSON); err == nil {
				for _, c := range coords {
					if len(c) >= 2 {
						a.zonePolygon = append(a.zonePolygon, geofence.Point{Lng: c[0], Lat: c[1]})
					}
				}
			}
		}
		if len(wardPolyJSON) > 0 {
			if coords, err := parsePolygonCoordinates(wardPolyJSON); err == nil {
				for _, c := range coords {
					if len(c) >= 2 {
						a.wardPolygon = append(a.wardPolygon, geofence.Point{Lng: c[0], Lat: c[1]})
					}
				}
			}
		}
		assignments = append(assignments, a)
	}

	type result struct {
		row UnauthorizedMovementRow
	}

	results := make([]result, 0)
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 10)

	for _, a := range assignments {
		wg.Add(1)
		sem <- struct{}{}
		go func(a vehAssign) {
			defer wg.Done()
			defer func() { <-sem }()

			events := detectUnauthorized(ctx, h, a, dayStart, dayEnd, transferStations, isToday, now)

			mu.Lock()
			for _, ev := range events {
				if statusFilter != "" && strings.ToLower(ev.Status) != statusFilter {
					continue
				}
				results = append(results, result{row: ev})
			}
			mu.Unlock()
		}(a)
	}
	wg.Wait()

	rows := make([]UnauthorizedMovementRow, len(results))
	for i, r := range results {
		rows[i] = r.row
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"date":    dateStr,
		"data":    rows,
	})
}

func detectUnauthorized(ctx context.Context, h *Handler, a vehAssign, dayStart, dayEnd time.Time, transferStations []TransferStationInfo, isToday bool, now time.Time) []UnauthorizedMovementRow {
	gpsData, err := h.gpsRepo.GetByVehicle(ctx, a.vehicleID, dayStart, dayEnd)
	if err != nil || len(gpsData) == 0 {
		return nil
	}

	// Build a set of transfer station polygons for fast TS check
	tsPolygons := make([]struct {
		polygon []geofence.Point
		id      int
	}, 0, len(transferStations))
	for _, ts := range transferStations {
		if len(ts.PolygonPoints) > 0 {
			tsPolygons = append(tsPolygons, struct {
				polygon []geofence.Point
				id      int
			}{polygon: ts.PolygonPoints, id: ts.ID})
		}
	}

	hasZonePoly := len(a.zonePolygon) > 0
	hasWardPoly := len(a.wardPolygon) > 0

	// State machine for unauthorized detection
	type unauthorizedState struct {
		startTime    time.Time
		lastOutside  time.Time
		tsTripCount  int
		isActive     bool
		lastLat      float64
		lastLng      float64
	}

	var events []UnauthorizedMovementRow
	var current *unauthorizedState

	resetState := func() {
		current = nil
	}

	isOutsideAssignedArea := func(p decoder.AVLData) bool {
		if p.Lat == 0 && p.Lng == 0 {
			return false // zero coordinates, ignore
		}
		pt := geofence.Point{Lat: p.Lat, Lng: p.Lng}
		inZone := true
		inWard := true
		if hasZonePoly {
			inZone = geofence.PointInPolygon(pt, a.zonePolygon)
		}
		if hasWardPoly {
			inWard = geofence.PointInPolygon(pt, a.wardPolygon)
		}
		return !inZone || !inWard
	}

	isInsideTransferStation := func(p decoder.AVLData) bool {
		pt := geofence.Point{Lat: p.Lat, Lng: p.Lng}
		for _, tsp := range tsPolygons {
			if geofence.PointInPolygon(pt, tsp.polygon) {
				return true
			}
		}
		return false
	}

	for _, p := range gpsData {
		if p.Lat == 0 && p.Lng == 0 {
			continue
		}

		outside := isOutsideAssignedArea(p)
		insideTS := isInsideTransferStation(p)

		if outside {
			if current == nil {
				// Start tracking
				current = &unauthorizedState{
					startTime:   p.Time,
					lastOutside: p.Time,
					lastLat:     p.Lat,
					lastLng:     p.Lng,
				}
			} else {
				current.lastOutside = p.Time
				current.lastLat = p.Lat
				current.lastLng = p.Lng
			}
		}

		if insideTS && current != nil {
			// A TS trip resets the timer
			current.tsTripCount++
			resetState()
			continue
		}

		// If currently outside, check if we crossed the 30-min threshold
		if current != nil {
			duration := p.Time.Sub(current.startTime)
			if duration >= 30*time.Minute {
				// Check if a TS trip happened during this window
				// (we already would have reset if one was detected above)
				// But also check via the trips table for robustness
				if !insideTS {
					var tsTripCount int
					_ = h.gpsRepo.Pool().QueryRow(ctx,
						`SELECT COUNT(*) FROM trips 
						 WHERE vehicle_id = $1 AND start_time >= $2 AND start_time <= $3`,
						a.vehicleID, current.startTime, p.Time,
					).Scan(&tsTripCount)

					if tsTripCount == 0 {
						unauthorizedEnd := p.Time
						status := "Active"
						if !isToday || unauthorizedEnd.Before(now.Add(-5*time.Minute)) {
							status = "Completed"
						}
						events = append(events, UnauthorizedMovementRow{
							VehicleID:         a.vehicleID,
							RegistrationNo:    a.regNo,
							VehicleType:       a.vehicleType,
							AssignedZone:      a.zoneName,
							AssignedWard:      a.wardName,
							UnauthorizedStart: current.startTime.Format("15:04:05"),
							UnauthorizedEnd:   unauthorizedEnd.Format("15:04:05"),
							TotalDurationSec:  int(duration.Seconds()),
							TotalDuration:     formatDuration(int(duration.Seconds())),
							Status:            status,
							Latitude:          current.lastLat,
							Longitude:         current.lastLng,
							LastGPSTime:       p.Time.Format("15:04:05"),
							TSTripCount:       0,
						})
					}
					resetState()
					continue
				}
			}
		}

		// If inside assigned area, reset
		if !outside {
			resetState()
		}
	}

	// Handle ongoing unauthorized event at end of GPS data
	if current != nil && isToday {
		duration := now.Sub(current.startTime)
		if duration >= 30*time.Minute {
			var tsTripCount int
			_ = h.gpsRepo.Pool().QueryRow(ctx,
				`SELECT COUNT(*) FROM trips 
				 WHERE vehicle_id = $1 AND start_time >= $2 AND start_time <= $3`,
				a.vehicleID, current.startTime, now,
			).Scan(&tsTripCount)

			if tsTripCount == 0 {
				events = append(events, UnauthorizedMovementRow{
					VehicleID:         a.vehicleID,
					RegistrationNo:    a.regNo,
					VehicleType:       a.vehicleType,
					AssignedZone:      a.zoneName,
					AssignedWard:      a.wardName,
					UnauthorizedStart: current.startTime.Format("15:04:05"),
					UnauthorizedEnd:   "",
					TotalDurationSec:  int(duration.Seconds()),
					TotalDuration:     formatDuration(int(duration.Seconds())),
					Status:            "Active",
					Latitude:          current.lastLat,
					Longitude:         current.lastLng,
					LastGPSTime:       now.Format("15:04:05"),
					TSTripCount:       tsTripCount,
				})
			}
		}
	}

	// Deduplicate: keep earliest start for overlapping events
	if len(events) > 1 {
		earliest := events[0]
		for _, e := range events[1:] {
			if e.TotalDurationSec > earliest.TotalDurationSec {
				earliest = e
			}
		}
		events = []UnauthorizedMovementRow{earliest}
	}

	return events
}


