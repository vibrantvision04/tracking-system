package api

import (
	"net/http"
	"strconv"
)

type AttendanceResponse struct {
	ID            string   `json:"id"`
	EmployeeID    string   `json:"employee_id"`
	EmployeeName  string   `json:"employee_name"`
	Role          string   `json:"role"`
	PunchInAt     string   `json:"punch_in_at"`
	PunchOutAt    *string  `json:"punch_out_at"`
	PunchOutMode  *string  `json:"punch_out_mode"`
	DriverName    *string  `json:"driver_name"`
	HelperName    *string  `json:"helper_name"`
	HelperPresent bool     `json:"helper_present"`
	VehicleNo     *string  `json:"vehicle_no"`
	PhotoPath     *string  `json:"photo_path"`
	GpsLat        *float64 `json:"gps_lat"`
	GpsLng        *float64 `json:"gps_lng"`
	WardName      *string  `json:"ward_name"`
	MarkedByName  *string  `json:"marked_by_name"`
	IsValid       bool     `json:"is_valid"`
	ShiftName     *string  `json:"shift_name"`
	CreatedAt     string   `json:"created_at"`
}

// GetAttendance returns attendance records based on filters.
func (h *Handler) GetAttendance(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	roleFilter := r.URL.Query().Get("role")
	liveFilter := r.URL.Query().Get("live")
	dateFilter := r.URL.Query().Get("date")

	query := `
		SELECT 
			a.id::text, 
			e.employee_id, 
			e.first_name || ' ' || e.last_name as employee_name,
			a.role, 
			TO_CHAR(a.punch_in_at, 'YYYY-MM-DD HH24:MI:SS') as punch_in_at,
			CASE WHEN a.punch_out_at IS NULL THEN NULL ELSE TO_CHAR(a.punch_out_at, 'YYYY-MM-DD HH24:MI:SS') END as punch_out_at,
			a.punch_out_mode,
			a.driver_name,
			a.helper_name,
			a.helper_present,
			v.registration_no as vehicle_no,
			a.photo_path,
			a.gps_lat,
			a.gps_lng,
			rg.region_name as ward_name,
			m.first_name || ' ' || m.last_name as marked_by_name,
			a.is_valid,
			s.shift_name,
			TO_CHAR(a.created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at
		FROM mobile_attendance a
		JOIN employees e ON a.user_id = e.id
		LEFT JOIN vehicles v ON a.vehicle_id = v.id
		LEFT JOIN regions rg ON a.ward_id = rg.id
		LEFT JOIN employees m ON a.marked_by = m.id
		LEFT JOIN shifts s ON a.shift_id = s.id
		WHERE 1=1
	`
	args := []interface{}{}
	argCount := 1

	if roleFilter != "" {
		query += " AND a.role = $" + strconv.Itoa(argCount)
		args = append(args, roleFilter)
		argCount++
	}

	if liveFilter == "true" {
		query += " AND a.created_at::DATE = CURRENT_DATE"
	} else if dateFilter != "" {
		query += " AND a.created_at::DATE = $" + strconv.Itoa(argCount)
		args = append(args, dateFilter)
		argCount++
	}

	query += " ORDER BY a.punch_in_at DESC"

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query attendance: " + err.Error()})
		return
	}
	defer rows.Close()

	var list []AttendanceResponse = []AttendanceResponse{}
	for rows.Next() {
		var att AttendanceResponse
		err := rows.Scan(
			&att.ID, &att.EmployeeID, &att.EmployeeName, &att.Role,
			&att.PunchInAt, &att.PunchOutAt, &att.PunchOutMode,
			&att.DriverName, &att.HelperName, &att.HelperPresent,
			&att.VehicleNo, &att.PhotoPath, &att.GpsLat, &att.GpsLng,
			&att.WardName, &att.MarkedByName, &att.IsValid, &att.ShiftName,
			&att.CreatedAt,
		)
		if err == nil {
			list = append(list, att)
		}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    list,
	})
}
