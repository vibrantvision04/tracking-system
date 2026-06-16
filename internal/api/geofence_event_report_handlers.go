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
	dayStart := time.Date(reportDate.Year(), reportDate.Month(), reportDate.Day(), 0, 0, 0, 0, reportDate.Location())
	dayEnd := dayStart.Add(24 * time.Hour)

	// Parse optional shift filter
	shiftID, _ := strconv.Atoi(r.URL.Query().Get("shift_id"))
	if shiftID > 0 {
		var startStr, endStr string
		err := db.QueryRow(ctx, "SELECT start_time::text, end_time::text FROM shifts WHERE id = $1", shiftID).Scan(&startStr, &endStr)
		if err != nil {
			sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Shift not found or invalid shift_id"})
			return
		}
		var sh, sm, ss, eh, em, es int
		fmt.Sscanf(startStr, "%d:%d:%d", &sh, &sm, &ss)
		fmt.Sscanf(endStr, "%d:%d:%d", &eh, &em, &es)

		shiftStart := time.Date(reportDate.Year(), reportDate.Month(), reportDate.Day(), sh, sm, ss, 0, reportDate.Location())
		shiftEnd := time.Date(reportDate.Year(), reportDate.Month(), reportDate.Day(), eh, em, es, 0, reportDate.Location())
		if shiftEnd.Before(shiftStart) || shiftEnd.Equal(shiftStart) {
			shiftEnd = shiftEnd.Add(24 * time.Hour)
		}
		dayStart = shiftStart
		dayEnd = shiftEnd
	}

	// Parse optional zone filter
	zoneID, _ := strconv.Atoi(r.URL.Query().Get("zone_id"))

	// 1. Fetch active vehicles (applying optional zone filter)
	vehQuery := `
		SELECT 
			v.id, 
			COALESCE(v.registration_no, ''),
			COALESCE(z.region_name, '') AS zone_name,
			COALESCE(w.region_name, '') AS ward_name,
			COALESCE(z.geofence_id, 0) AS zone_geofence_id,
			COALESCE(w.geofence_id, 0) AS ward_geofence_id
		FROM vehicles v
		LEFT JOIN regions z ON v.zone_id = z.id AND z.region_type_id = 2
		LEFT JOIN regions w ON v.ward_id = w.id AND w.region_type_id = 3
		WHERE v.is_active = true
	`
	var vehArgs []interface{}
	if zoneID > 0 {
		vehQuery += " AND v.zone_id = $1"
		vehArgs = append(vehArgs, zoneID)
	}
	vehQuery += " ORDER BY v.registration_no ASC"

	vehRows, err := db.Query(ctx, vehQuery, vehArgs...)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query vehicles: " + err.Error()})
		return
	}
	defer vehRows.Close()

	type VehicleInfo struct {
		ID             int
		RegistrationNo string
		ZoneName       string
		WardName       string
		ZoneGeofenceID int
		WardGeofenceID int
	}

	var vehicles []VehicleInfo
	var vehicleIDs []int
	for vehRows.Next() {
		var v VehicleInfo
		if err := vehRows.Scan(&v.ID, &v.RegistrationNo, &v.ZoneName, &v.WardName, &v.ZoneGeofenceID, &v.WardGeofenceID); err == nil {
			vehicles = append(vehicles, v)
			vehicleIDs = append(vehicleIDs, v.ID)
		}
	}

	// 2. Fetch all geofence events for the fetched vehicles on the given day
	type EventTemp struct {
		ID             int
		VehicleID      int
		GeofenceID     int
		EventType      string
		EventTime      time.Time
		Entity         string
		EntityName     string
	}

	eventsMap := make(map[int][]EventTemp)
	if len(vehicleIDs) > 0 {
		eventQuery := `
			SELECT 
				ge.id,
				ge.vehicle_id,
				ge.geofence_id,
				ge.event_type,
				ge.captured_at,
				CASE
					WHEN ts.id IS NOT NULL THEN 'Transport Station'
					WHEN pl.id IS NOT NULL THEN 'Parking'
					WHEN ws.id IS NOT NULL THEN 'Workshop'
					WHEN fs.id IS NOT NULL THEN 'Fuel Station'
					WHEN rg.id IS NOT NULL AND rg.region_type_id = 2 THEN 'Zone'
					WHEN rg.id IS NOT NULL AND rg.region_type_id = 3 THEN 'Ward'
					ELSE 'Geofence'
				END AS entity,
				CASE
					WHEN ts.id IS NOT NULL THEN ts.name
					WHEN pl.id IS NOT NULL THEN pl.parking_lot_name
					WHEN ws.id IS NOT NULL THEN ws.name
					WHEN fs.id IS NOT NULL THEN fs.name
					WHEN rg.id IS NOT NULL THEN rg.region_name
					ELSE g.name
				END AS entity_name
			FROM geofence_events ge
			JOIN geofences g ON ge.geofence_id = g.id
			LEFT JOIN transfer_stations ts ON ts.geofence_id = g.id
			LEFT JOIN parking_lots pl ON pl.geofence_id = g.id
			LEFT JOIN workshops ws ON ws.geofence_id = g.id
			LEFT JOIN fuel_stations fs ON fs.geofence_id = g.id
			LEFT JOIN regions rg ON rg.geofence_id = g.id
			WHERE ge.captured_at >= $1 AND ge.captured_at < $2
			  AND ge.vehicle_id = ANY($3)
			ORDER BY ge.captured_at ASC
		`
		evRows, err := db.Query(ctx, eventQuery, dayStart, dayEnd, vehicleIDs)
		if err == nil {
			defer evRows.Close()
			for evRows.Next() {
				var ev EventTemp
				if err := evRows.Scan(&ev.ID, &ev.VehicleID, &ev.GeofenceID, &ev.EventType, &ev.EventTime, &ev.Entity, &ev.EntityName); err == nil {
					eventsMap[ev.VehicleID] = append(eventsMap[ev.VehicleID], ev)
				}
			}
		} else {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query geofence events: " + err.Error()})
			return
		}
	}

	// 3. Process sessions and count summary metrics for each vehicle
	type GeofenceSession struct {
		GeofenceName string     `json:"geofence_name"`
		Entity       string     `json:"entity"`
		EntryTime    time.Time  `json:"entry_time"`
		ExitTime     *time.Time `json:"exit_time"`
		Duration     string     `json:"duration"`
	}

	type VehicleGeofenceSummary struct {
		VehicleID            int               `json:"vehicle_id"`
		RegistrationNo       string            `json:"registration_no"`
		ZoneName             string            `json:"zone_name"`
		WardName             string            `json:"ward_name"`
		TotalZoneVisits      int               `json:"total_zone_visits"`
		TotalWardVisits      int               `json:"total_ward_visits"`
		TotalFuelVisits      int               `json:"total_fuel_visits"`
		TotalTransportVisits int               `json:"total_transport_visits"`
		TotalWorkshopVisits  int               `json:"total_workshop_visits"`
		TotalParkingVisits   int               `json:"total_parking_visits"`
		TotalEvents          int               `json:"total_events"`
		Sessions             []GeofenceSession `json:"sessions"`
	}

	var data []VehicleGeofenceSummary = []VehicleGeofenceSummary{}

	for _, v := range vehicles {
		vehicleEvents := eventsMap[v.ID]

		// Group events by geofence, filtering out unassigned Zone/Ward events
		gEvents := make(map[int][]EventTemp)
		totalEventsCount := 0

		for _, ev := range vehicleEvents {
			// Filter Zone events to only process assigned zone
			if ev.Entity == "Zone" {
				if v.ZoneGeofenceID == 0 || ev.GeofenceID != v.ZoneGeofenceID {
					continue
				}
			}
			// Filter Ward events to only process assigned ward
			if ev.Entity == "Ward" {
				if v.WardGeofenceID == 0 || ev.GeofenceID != v.WardGeofenceID {
					continue
				}
			}

			gEvents[ev.GeofenceID] = append(gEvents[ev.GeofenceID], ev)
			totalEventsCount++
		}

		sessions := []GeofenceSession{}
		var zoneVisits, wardVisits, fuelVisits, transportVisits, workshopVisits, parkingVisits int

		for _, events := range gEvents {
			var activeSession *GeofenceSession = nil
			for _, ev := range events {
				if ev.EventType == "enter" {
					if activeSession != nil {
						// Close previous active session
						exitT := ev.EventTime
						activeSession.ExitTime = &exitT
						activeSession.Duration = formatGeofenceDuration(exitT.Sub(activeSession.EntryTime))
						sessions = append(sessions, *activeSession)
					}
					activeSession = &GeofenceSession{
						GeofenceName: ev.EntityName,
						Entity:       ev.Entity,
						EntryTime:    ev.EventTime,
					}
				} else if ev.EventType == "exit" {
					if activeSession != nil {
						exitT := ev.EventTime
						activeSession.ExitTime = &exitT
						activeSession.Duration = formatGeofenceDuration(exitT.Sub(activeSession.EntryTime))
						sessions = append(sessions, *activeSession)
						activeSession = nil
					} else {
						// Exit without enter: assume entry at dayStart
						entryT := dayStart
						exitT := ev.EventTime
						sessions = append(sessions, GeofenceSession{
							GeofenceName: ev.EntityName,
							Entity:       ev.Entity,
							EntryTime:    entryT,
							ExitTime:     &exitT,
							Duration:     formatGeofenceDuration(exitT.Sub(entryT)),
						})
					}
				}
			}
			// Handle unclosed session at the end of the day
			if activeSession != nil {
				endTime := dayEnd
				nowInIndia := utils.CurrentTimeInIndia()
				if nowInIndia.Before(dayEnd) && nowInIndia.After(dayStart) {
					endTime = nowInIndia
				}
				activeSession.Duration = formatGeofenceDuration(endTime.Sub(activeSession.EntryTime))
				sessions = append(sessions, *activeSession)
			}
		}

		// Sort sessions chronologically by EntryTime
		for i := 0; i < len(sessions); i++ {
			for j := i + 1; j < len(sessions); j++ {
				if sessions[i].EntryTime.After(sessions[j].EntryTime) {
					sessions[i], sessions[j] = sessions[j], sessions[i]
				}
			}
		}

		// Count visit metrics
		for _, s := range sessions {
			switch s.Entity {
			case "Zone":
				zoneVisits++
			case "Ward":
				wardVisits++
			case "Fuel Station":
				fuelVisits++
			case "Transport Station":
				transportVisits++
			case "Workshop":
				workshopVisits++
			case "Parking":
				parkingVisits++
			}
		}

		data = append(data, VehicleGeofenceSummary{
			VehicleID:            v.ID,
			RegistrationNo:       v.RegistrationNo,
			ZoneName:             v.ZoneName,
			WardName:             v.WardName,
			TotalZoneVisits:      zoneVisits,
			TotalWardVisits:      wardVisits,
			TotalFuelVisits:      fuelVisits,
			TotalTransportVisits: transportVisits,
			TotalWorkshopVisits:  workshopVisits,
			TotalParkingVisits:   parkingVisits,
			TotalEvents:          totalEventsCount,
			Sessions:             sessions,
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

