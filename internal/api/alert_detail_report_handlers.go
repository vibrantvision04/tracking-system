package api

import (
	"fmt"
	"gps-tracking-system/internal/utils"
	"net/http"
	"strconv"
	"time"
)

type AlertDetailReportRow struct {
	ID              int       `json:"id"`
	ZoneName        string    `json:"zone_name"`
	WardName        string    `json:"ward_name"`
	RegistrationNo  string    `json:"registration_no"`
	VehicleTypeName string    `json:"vehicle_type_name"`
	AlertType       string    `json:"alert_type"`
	AlertDetail     string    `json:"alert_detail"`
	Status          string    `json:"status"`
	Reason          string    `json:"reason"`
	TimeReported    time.Time `json:"time_reported"`
	ShiftName       string    `json:"shift_name"`
}

func (h *Handler) GetAlertDetailReport(w http.ResponseWriter, r *http.Request) {
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
	dateFilter := reportDate.Format("2006-01-02")

	// Parse other filters
	zoneID, _ := strconv.Atoi(r.URL.Query().Get("zone_id"))
	wardID, _ := strconv.Atoi(r.URL.Query().Get("ward_id"))
	vehicleID, _ := strconv.Atoi(r.URL.Query().Get("vehicle_id"))
	shiftID, _ := strconv.Atoi(r.URL.Query().Get("shift_id"))
	alertType := r.URL.Query().Get("alert_type")

	// Dynamic SQL query joining tables
	query := `
		SELECT 
			a.id,
			COALESCE(z.region_name, '') AS zone_name,
			COALESCE(w.region_name, '') AS ward_name,
			a.registration_no,
			COALESCE(vt.vehicle_type_name, 'Other') AS vehicle_type_name,
			a.alert_type,
			a.alert_detail,
			a.status,
			COALESCE(a.reason, '') AS reason,
			a.time_reported,
			COALESCE(s.shift_name, 'General Shift') AS shift_name
		FROM alerts a
		JOIN vehicles v ON a.vehicle_id = v.id
		LEFT JOIN vehicle_types_swift vt ON v.vehicle_type_id = vt.id
		LEFT JOIN regions w ON v.ward_id = w.id
		LEFT JOIN regions z ON v.zone_id = z.id
		LEFT JOIN (
			SELECT DISTINCT ON (vehicle_id) vehicle_id, route_id
			FROM vehicle_route_assignments
			WHERE is_active = true
			ORDER BY vehicle_id, assigned_date DESC, id DESC
		) vra ON v.id = vra.vehicle_id
		LEFT JOIN routes rt ON vra.route_id = rt.id
		LEFT JOIN shifts s ON rt.shift_id = s.id
		WHERE DATE(a.time_reported) = $1
	`
	var args []interface{}
	args = append(args, dateFilter)
	argCount := 1

	if zoneID > 0 {
		argCount++
		query += fmt.Sprintf(" AND v.zone_id = $%d", argCount)
		args = append(args, zoneID)
	}
	if wardID > 0 {
		argCount++
		query += fmt.Sprintf(" AND v.ward_id = $%d", argCount)
		args = append(args, wardID)
	}
	if vehicleID > 0 {
		argCount++
		query += fmt.Sprintf(" AND a.vehicle_id = $%d", argCount)
		args = append(args, vehicleID)
	}
	if shiftID > 0 {
		argCount++
		query += fmt.Sprintf(" AND rt.shift_id = $%d", argCount)
		args = append(args, shiftID)
	}
	if alertType != "" {
		argCount++
		query += fmt.Sprintf(" AND a.alert_type = $%d", argCount)
		args = append(args, alertType)
	}

	query += " ORDER BY a.time_reported DESC"

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query alert detail report: " + err.Error()})
		return
	}
	defer rows.Close()

	var data []AlertDetailReportRow = []AlertDetailReportRow{}
	for rows.Next() {
		var row AlertDetailReportRow
		err := rows.Scan(
			&row.ID, &row.ZoneName, &row.WardName, &row.RegistrationNo,
			&row.VehicleTypeName, &row.AlertType, &row.AlertDetail,
			&row.Status, &row.Reason, &row.TimeReported, &row.ShiftName,
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
