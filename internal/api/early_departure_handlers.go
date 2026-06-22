package api

import (
	"fmt"
	"net/http"
	"time"
)

type EarlyDepartureRecord struct {
	VehicleID       int     `json:"vehicle_id"`
	RegistrationNo  string  `json:"registration_no"`
	RouteName       string  `json:"route_name"`
	ShiftName       string  `json:"shift_name"`
	ShiftStartTime  string  `json:"shift_start_time"`
	ShiftEndTime    string  `json:"shift_end_time"`
	FirstActiveTime string  `json:"first_active_time"`
	LastActiveTime  string  `json:"last_active_time"`
	EarlyDepartBy   string  `json:"early_depart_by"`
}

// GetEarlyDepartureReport returns list of vehicles that departed early from morning shift.
func (h *Handler) GetEarlyDepartureReport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	dateStr := r.URL.Query().Get("date")
	if dateStr == "" {
		dateStr = time.Now().Format("2006-01-02")
	}

	thresholdHour := r.URL.Query().Get("threshold")
	if thresholdHour == "" {
		thresholdHour = "12:00:00"
	}

	endHour := r.URL.Query().Get("end_time")
	if endHour == "" {
		endHour = "15:00:00"
	}

	query := `
		SELECT 
			v.id as vehicle_id,
			v.registration_no,
			COALESCE(rt.route_name, 'No Route') as route_name,
			COALESCE(s.shift_name, 'Morning Shift') as shift_name,
			COALESCE(s.start_time::text, '06:00:00') as shift_start_time,
			COALESCE(s.end_time::text, '14:00:00') as shift_end_time,
			TO_CHAR(MIN(g.captured_at AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD HH24:MI:SS') as first_active_time,
			TO_CHAR(MAX(g.captured_at AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD HH24:MI:SS') as last_active_time
		FROM vehicles v
		JOIN vehicle_route_assignments vra ON v.id = vra.vehicle_id AND vra.assigned_date = $1
		LEFT JOIN routes rt ON vra.route_id = rt.id
		LEFT JOIN shifts s ON vra.shift_id = s.id
		JOIN vehicle_gps_map vgm ON v.id = vgm.vehicle_id
		JOIN gps_devices gd ON vgm.device_id = gd.id
		JOIN gps_data g ON gd.imei = g.imei
		WHERE g.captured_at AT TIME ZONE 'Asia/Kolkata' >= ($1 || ' 00:00:00')::TIMESTAMP
		  AND g.captured_at AT TIME ZONE 'Asia/Kolkata' <= ($1 || ' ' || $3)::TIMESTAMP
		  AND (g.ignition = 1 OR g.speed > 2.0)
		  AND (s.shift_name ILIKE '%morning%' OR s.id = 1)
		GROUP BY v.id, v.registration_no, rt.route_name, s.shift_name, s.start_time, s.end_time
		HAVING MAX(g.captured_at AT TIME ZONE 'Asia/Kolkata') < ($1 || ' ' || $2)::TIMESTAMP
		ORDER BY last_active_time ASC
	`

	rows, err := db.Query(ctx, query, dateStr, thresholdHour, endHour)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query early departures: " + err.Error()})
		return
	}
	defer rows.Close()

	var list []EarlyDepartureRecord = []EarlyDepartureRecord{}
	for rows.Next() {
		var rec EarlyDepartureRecord
		err := rows.Scan(
			&rec.VehicleID, &rec.RegistrationNo, &rec.RouteName, &rec.ShiftName,
			&rec.ShiftStartTime, &rec.ShiftEndTime, &rec.FirstActiveTime, &rec.LastActiveTime,
		)
		if err == nil {
			// Calculate Early Departed Duration in Go
			lastActive, err1 := time.Parse("2006-06-22 15:04:05", dateStr+" "+rec.ShiftEndTime)
			actualLast, err2 := time.Parse("2006-01-02 15:04:05", rec.LastActiveTime)
			
			if err1 == nil && err2 == nil {
				diff := lastActive.Sub(actualLast)
				if diff > 0 {
					hours := int(diff.Hours())
					minutes := int(diff.Minutes()) % 60
					rec.EarlyDepartBy = fmt.Sprintf("%dh %dm", hours, minutes)
				} else {
					rec.EarlyDepartBy = "0h 0m"
				}
			} else {
				// Fallback calculation using standard 2:00 PM shift end
				lastActiveFallback, _ := time.Parse("2006-01-02 15:04:05", dateStr+" 14:00:00")
				diff := lastActiveFallback.Sub(actualLast)
				if diff > 0 {
					hours := int(diff.Hours())
					minutes := int(diff.Minutes()) % 60
					rec.EarlyDepartBy = fmt.Sprintf("%dh %dm", hours, minutes)
				} else {
					rec.EarlyDepartBy = "—"
				}
			}

			list = append(list, rec)
		}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    list,
	})
}
