package api

import (
	"fmt"
	"gps-tracking-system/internal/utils"
	"net/http"
	"strconv"
	"time"
)

type GeofenceEventReportRow struct {
	ID              int       `json:"id"`
	RegistrationNo  string    `json:"registration_no"`
	VehicleTypeName string    `json:"vehicle_type_name"`
	ZoneName        string    `json:"zone_name"`
	WardName        string    `json:"ward_name"`
	Entity          string    `json:"entity"`
	EntityName      string    `json:"entity_name"`
	EventType       string    `json:"event_type"`
	EventTime       time.Time `json:"event_time"`
	WardInside      string    `json:"ward_inside,omitempty"`
	WardOutside     string    `json:"ward_outside,omitempty"`
	ZoneInside      string    `json:"zone_inside,omitempty"`
	ZoneOutside     string    `json:"zone_outside,omitempty"`
}

func formatGeofenceDuration(d time.Duration) string {
	h := int(d.Hours())
	m := int(d.Minutes()) % 60
	s := int(d.Seconds()) % 60
	if h > 0 {
		return fmt.Sprintf("%dh %dm", h, m)
	}
	if m > 0 {
		return fmt.Sprintf("%dm %ds", m, s)
	}
	return fmt.Sprintf("%ds", s)
}

func (h *Handler) GetGeofenceEventReport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	// Parse date filter, defaulting to today
	dateStr := r.URL.Query().Get("date")
	var reportDate time.Time
	var err error
	if dateStr != "" {
		reportDate, err = time.ParseInLocation("2006-01-02", dateStr, utils.IndianLocation)
		if err != nil {
			sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid date format, use YYYY-MM-DD"})
			return
		}
	} else {
		reportDate = utils.CurrentTimeInIndia()
	}
	// Normalize to start of day
	reportDate = time.Date(reportDate.Year(), reportDate.Month(), reportDate.Day(), 0, 0, 0, 0, reportDate.Location())
	dateFilter := reportDate.Format("2006-01-02")

	// Parse optional zone filter
	zoneID, _ := strconv.Atoi(r.URL.Query().Get("zone_id"))

	// Fetch vehicle geofence mappings
	type VehicleGeofenceInfo struct {
		WardGeofenceID int
		ZoneGeofenceID int
	}
	vehGeofences := make(map[int]VehicleGeofenceInfo)
	rowsVG, err := db.Query(ctx, `
		SELECT v.id, COALESCE(w.geofence_id, 0), COALESCE(z.geofence_id, 0)
		FROM vehicles v
		LEFT JOIN regions w ON v.ward_id = w.id
		LEFT JOIN regions z ON v.zone_id = z.id
	`)
	if err == nil {
		defer rowsVG.Close()
		for rowsVG.Next() {
			var vID, wGid, zGid int
			if err := rowsVG.Scan(&vID, &wGid, &zGid); err == nil {
				vehGeofences[vID] = VehicleGeofenceInfo{
					WardGeofenceID: wGid,
					ZoneGeofenceID: zGid,
				}
			}
		}
	}

	// Build the query joining geofence_events with vehicle, vehicle_type, regions,
	// and reverse-mapping geofence_id to owning entities (transfer_stations, parking_lots, workshops, fuel_stations)
	query := `
		SELECT 
			ge.id,
			v.registration_no,
			COALESCE(vt.vehicle_type_name, 'Other') AS vehicle_type_name,
			COALESCE(z.region_name, '') AS zone_name,
			COALESCE(w.region_name, '') AS ward_name,
			CASE
				WHEN ts.id IS NOT NULL THEN 'Transfer Station'
				WHEN pl.id IS NOT NULL THEN 'Parking Lot'
				WHEN ws.id IS NOT NULL THEN 'Workshop'
				WHEN fs.id IS NOT NULL THEN 'Fuel Station'
				WHEN rg.id IS NOT NULL THEN 'Region'
				ELSE 'Geofence'
			END AS entity,
			CASE
				WHEN ts.id IS NOT NULL THEN ts.name
				WHEN pl.id IS NOT NULL THEN pl.parking_lot_name
				WHEN ws.id IS NOT NULL THEN ws.name
				WHEN fs.id IS NOT NULL THEN fs.name
				WHEN rg.id IS NOT NULL THEN rg.region_name
				ELSE g.name
			END AS entity_name,
			ge.event_type,
			ge.captured_at,
			ge.vehicle_id,
			ge.geofence_id
		FROM geofence_events ge
		JOIN vehicles v ON ge.vehicle_id = v.id
		JOIN geofences g ON ge.geofence_id = g.id
		LEFT JOIN vehicle_types_vswm vt ON v.vehicle_type_id = vt.id
		LEFT JOIN regions z ON v.zone_id = z.id
		LEFT JOIN regions w ON v.ward_id = w.id
		LEFT JOIN transfer_stations ts ON ts.geofence_id = g.id
		LEFT JOIN parking_lots pl ON pl.geofence_id = g.id
		LEFT JOIN workshops ws ON ws.geofence_id = g.id
		LEFT JOIN fuel_stations fs ON fs.geofence_id = g.id
		LEFT JOIN regions rg ON rg.geofence_id = g.id
		WHERE DATE(ge.captured_at) = $1
	`
	var args []interface{}
	args = append(args, dateFilter)
	argCount := 1

	if zoneID > 0 {
		argCount++
		query += fmt.Sprintf(" AND v.zone_id = $%d", argCount)
		args = append(args, zoneID)
	}

	query += " ORDER BY ge.captured_at ASC"

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query geofence event report: " + err.Error()})
		return
	}
	defer rows.Close()

	type EventTemp struct {
		ID              int
		RegistrationNo  string
		VehicleTypeName string
		ZoneName        string
		WardName        string
		Entity          string
		EntityName      string
		EventType       string
		EventTime       time.Time
		VehicleID       int
		GeofenceID      int
	}

	var tempEvents []EventTemp
	for rows.Next() {
		var ev EventTemp
		err := rows.Scan(
			&ev.ID, &ev.RegistrationNo, &ev.VehicleTypeName,
			&ev.ZoneName, &ev.WardName,
			&ev.Entity, &ev.EntityName,
			&ev.EventType, &ev.EventTime,
			&ev.VehicleID, &ev.GeofenceID,
		)
		if err == nil {
			tempEvents = append(tempEvents, ev)
		}
	}

	// Calculate stay durations
	type VehicleState struct {
		LastWardEnter time.Time
		LastWardExit  time.Time
		LastZoneEnter time.Time
		LastZoneExit  time.Time
	}
	vehStates := make(map[int]*VehicleState)
	dayStart := reportDate

	var data []GeofenceEventReportRow = []GeofenceEventReportRow{}
	for _, ev := range tempEvents {
		state, exists := vehStates[ev.VehicleID]
		if !exists {
			state = &VehicleState{
				LastWardEnter: dayStart,
				LastWardExit:  dayStart,
				LastZoneEnter: dayStart,
				LastZoneExit:  dayStart,
			}
			vehStates[ev.VehicleID] = state
		}

		info := vehGeofences[ev.VehicleID]

		var wardInside, wardOutside, zoneInside, zoneOutside string

		if ev.GeofenceID == info.WardGeofenceID {
			if ev.EventType == "exit" {
				duration := ev.EventTime.Sub(state.LastWardEnter)
				if duration > 0 {
					wardInside = formatGeofenceDuration(duration)
				}
				state.LastWardExit = ev.EventTime
			} else if ev.EventType == "enter" {
				duration := ev.EventTime.Sub(state.LastWardExit)
				if duration > 0 {
					wardOutside = formatGeofenceDuration(duration)
				}
				state.LastWardEnter = ev.EventTime
			}
		} else if ev.GeofenceID == info.ZoneGeofenceID {
			if ev.EventType == "exit" {
				duration := ev.EventTime.Sub(state.LastZoneEnter)
				if duration > 0 {
					zoneInside = formatGeofenceDuration(duration)
				}
				state.LastZoneExit = ev.EventTime
			} else if ev.EventType == "enter" {
				duration := ev.EventTime.Sub(state.LastZoneExit)
				if duration > 0 {
					zoneOutside = formatGeofenceDuration(duration)
				}
				state.LastZoneEnter = ev.EventTime
			}
		}

		data = append(data, GeofenceEventReportRow{
			ID:              ev.ID,
			RegistrationNo:  ev.RegistrationNo,
			VehicleTypeName: ev.VehicleTypeName,
			ZoneName:        ev.ZoneName,
			WardName:        ev.WardName,
			Entity:          ev.Entity,
			EntityName:      ev.EntityName,
			EventType:       ev.EventType,
			EventTime:       ev.EventTime,
			WardInside:      wardInside,
			WardOutside:     wardOutside,
			ZoneInside:      zoneInside,
			ZoneOutside:     zoneOutside,
		})
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    data,
	})
}

type WardGeofenceReportRow struct {
	ID             int       `json:"id"`
	RegistrationNo string    `json:"registration_no"`
	WardName       string    `json:"ward_name"`
	EventType      string    `json:"event_type"`
	EventTime      time.Time `json:"event_time"`
}

func (h *Handler) GetWardGeofenceReport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	// Parse from_date and to_date filters, defaulting to today
	fromDateStr := r.URL.Query().Get("from_date")
	toDateStr := r.URL.Query().Get("to_date")

	var fromDate, toDate time.Time
	var err error

	if fromDateStr != "" {
		fromDate, err = time.ParseInLocation("2006-01-02", fromDateStr, utils.IndianLocation)
		if err != nil {
			sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid from_date format, use YYYY-MM-DD"})
			return
		}
	} else {
		fromDate = utils.CurrentTimeInIndia()
	}

	if toDateStr != "" {
		toDate, err = time.ParseInLocation("2006-01-02", toDateStr, utils.IndianLocation)
		if err != nil {
			sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid to_date format, use YYYY-MM-DD"})
			return
		}
	} else {
		toDate = utils.CurrentTimeInIndia()
	}

	query := `
		SELECT 
			ge.id,
			v.registration_no,
			COALESCE(rg.region_name, '') AS ward_name,
			ge.event_type,
			ge.captured_at
		FROM geofence_events ge
		JOIN vehicles v ON ge.vehicle_id = v.id
		JOIN geofences g ON ge.geofence_id = g.id
		JOIN regions rg ON rg.geofence_id = g.id
		WHERE rg.region_type_id = 3
		  AND DATE(ge.captured_at) >= $1
		  AND DATE(ge.captured_at) <= $2
		ORDER BY ge.captured_at ASC
	`

	rows, err := db.Query(ctx, query, fromDate.Format("2006-01-02"), toDate.Format("2006-01-02"))
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query ward geofence report: " + err.Error()})
		return
	}
	defer rows.Close()

	var data []WardGeofenceReportRow = []WardGeofenceReportRow{}
	for rows.Next() {
		var row WardGeofenceReportRow
		err := rows.Scan(
			&row.ID, &row.RegistrationNo, &row.WardName,
			&row.EventType, &row.EventTime,
		)
		if err == nil {
			data = append(data, row)
		}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    data,
	})
}

