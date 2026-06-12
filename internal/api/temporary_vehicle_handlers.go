package api

import (
	"encoding/json"
	"gps-tracking-system/internal/utils"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
)

type TemporaryVehicleResponse struct {
	ID                 int    `json:"id"`
	WardID             int    `json:"ward_id"`
	WardName           string `json:"ward_name"`
	ShiftID            int    `json:"shift_id"`
	ShiftName          string `json:"shift_name"`
	RouteID            int    `json:"route_id"`
	RouteName          string `json:"route_name"`
	VehicleID          int    `json:"vehicle_id"`
	VehicleRegNo       string `json:"vehicle_reg_no"`
	AssignmentDate     string `json:"assignment_date"`
	AssignedAt         string `json:"assigned_at"`
}

func (h *Handler) GetTemporaryVehicles(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	shiftIDStr := r.URL.Query().Get("shift_id")
	dateStr := r.URL.Query().Get("date")

	var shiftID *int
	if shiftIDStr != "" && shiftIDStr != "null" {
		if id, err := strconv.Atoi(shiftIDStr); err == nil {
			shiftID = &id
		}
	}

	var targetDate *string
	if dateStr != "" && dateStr != "null" {
		if _, err := time.ParseInLocation("2006-01-02", dateStr, utils.IndianLocation); err == nil {
			targetDate = &dateStr
		}
	}

	query := `
		SELECT 
			tv.id, 
			tv.ward_id, 
			COALESCE(w.region_name, ''),
			tv.shift_id, 
			COALESCE(s.shift_name, ''),
			tv.route_id, 
			COALESCE(r.route_name, ''),
			tv.vehicle_id, 
			COALESCE(v.registration_no, ''),
			TO_CHAR(tv.assignment_date, 'YYYY-MM-DD'),
			TO_CHAR(tv.created_at, 'HH12:MI:SS AM DD-MM-YYYY')
		FROM temporary_vehicles tv
		JOIN regions w ON tv.ward_id = w.id
		JOIN shifts s ON tv.shift_id = s.id
		JOIN routes r ON tv.route_id = r.id
		JOIN vehicles v ON tv.vehicle_id = v.id
		WHERE ($1::int IS NULL OR tv.shift_id = $1)
		  AND ($2::date IS NULL OR tv.assignment_date = $2)
		ORDER BY tv.id DESC
	`

	rows, err := db.Query(ctx, query, shiftID, targetDate)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch temporary vehicles: " + err.Error()})
		return
	}
	defer rows.Close()

	list := []TemporaryVehicleResponse{}
	for rows.Next() {
		var tv TemporaryVehicleResponse
		err := rows.Scan(
			&tv.ID, 
			&tv.WardID, 
			&tv.WardName,
			&tv.ShiftID, 
			&tv.ShiftName,
			&tv.RouteID, 
			&tv.RouteName,
			&tv.VehicleID, 
			&tv.VehicleRegNo,
			&tv.AssignmentDate,
			&tv.AssignedAt,
		)
		if err == nil {
			list = append(list, tv)
		}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": list})
}

func (h *Handler) CreateTemporaryVehicle(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	var req struct {
		WardID         int    `json:"ward_id"`
		ShiftID        int    `json:"shift_id"`
		RouteID        int    `json:"route_id"`
		VehicleID      int    `json:"vehicle_id"`
		AssignmentDate string `json:"assignment_date"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload: " + err.Error()})
		return
	}

	if req.WardID <= 0 || req.ShiftID <= 0 || req.RouteID <= 0 || req.VehicleID <= 0 || req.AssignmentDate == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "All fields (ward_id, shift_id, route_id, vehicle_id, assignment_date) are required"})
		return
	}

	parsedDate, err := time.ParseInLocation("2006-01-02", req.AssignmentDate, utils.IndianLocation)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid date format, use YYYY-MM-DD"})
		return
	}

	var newID int
	err = db.QueryRow(ctx, `
		INSERT INTO temporary_vehicles (ward_id, shift_id, route_id, vehicle_id, assignment_date)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (route_id, shift_id, assignment_date)
		DO UPDATE SET vehicle_id = EXCLUDED.vehicle_id, ward_id = EXCLUDED.ward_id, created_at = NOW()
		RETURNING id
	`, req.WardID, req.ShiftID, req.RouteID, req.VehicleID, parsedDate.Format("2006-01-02")).Scan(&newID)

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create/override temporary vehicle: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusCreated, map[string]interface{}{"success": true, "id": newID})
}

func (h *Handler) UpdateTemporaryVehicle(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid assignment ID"})
		return
	}

	var req struct {
		WardID         int    `json:"ward_id"`
		ShiftID        int    `json:"shift_id"`
		RouteID        int    `json:"route_id"`
		VehicleID      int    `json:"vehicle_id"`
		AssignmentDate string `json:"assignment_date"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload: " + err.Error()})
		return
	}

	if req.WardID <= 0 || req.ShiftID <= 0 || req.RouteID <= 0 || req.VehicleID <= 0 || req.AssignmentDate == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "All fields (ward_id, shift_id, route_id, vehicle_id, assignment_date) are required"})
		return
	}

	parsedDate, err := time.ParseInLocation("2006-01-02", req.AssignmentDate, utils.IndianLocation)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid date format, use YYYY-MM-DD"})
		return
	}

	_, err = db.Exec(ctx, `
		UPDATE temporary_vehicles 
		SET ward_id = $1, shift_id = $2, route_id = $3, vehicle_id = $4, assignment_date = $5, created_at = NOW()
		WHERE id = $6
	`, req.WardID, req.ShiftID, req.RouteID, req.VehicleID, parsedDate.Format("2006-01-02"), id)

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update temporary vehicle assignment: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *Handler) DeleteTemporaryVehicle(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid assignment ID"})
		return
	}

	_, err = db.Exec(ctx, "DELETE FROM temporary_vehicles WHERE id = $1", id)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete assignment: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *Handler) GetRegularVehicleForRoute(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	routeIDStr := chi.URLParam(r, "route_id")
	routeID, err := strconv.Atoi(routeIDStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid route ID"})
		return
	}

	// targetDate is no longer used for the fallback vehicle query

	var registrationNo string
	err = db.QueryRow(ctx, `
		SELECT v.registration_no 
		FROM vehicle_route_assignments va 
		JOIN vehicles v ON va.vehicle_id = v.id 
		WHERE va.route_id = $1 AND va.is_active = true 
		ORDER BY va.assigned_date DESC, va.id DESC
		LIMIT 1
	`, routeID).Scan(&registrationNo)

	if err != nil {
		// No regular vehicle found, return success: true but empty vehicle name
		sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "vehicle": ""})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "vehicle": registrationNo})
}
