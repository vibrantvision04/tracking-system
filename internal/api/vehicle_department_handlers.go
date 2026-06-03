package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

type VehicleDepartmentResponse struct {
	ID                    int    `json:"id"`
	VehicleID             int    `json:"vehicle_id"`
	VehicleRegistrationNo string `json:"vehicle_registration_no"`
	DepartmentID          int    `json:"department_id"`
	DepartmentName        string `json:"department_name"`
	CreatedAt             string `json:"created_at"`
}

// GetVehicleDepartments returns all mapped vehicle-departments from the database.
func (h *Handler) GetVehicleDepartments(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	rows, err := db.Query(ctx, `
		SELECT vd.id, vd.vehicle_id, v.registration_no, vd.department_id, d.name, TO_CHAR(vd.created_at, 'YYYY-MM-DD HH24:MI:SS')
		FROM vehicle_departments vd
		JOIN vehicles v ON vd.vehicle_id = v.id
		JOIN departments d ON vd.department_id = d.id
		ORDER BY vd.id ASC
	`)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query vehicle departments: " + err.Error()})
		return
	}
	defer rows.Close()

	var list []VehicleDepartmentResponse = []VehicleDepartmentResponse{}
	for rows.Next() {
		var vd VehicleDepartmentResponse
		if err := rows.Scan(&vd.ID, &vd.VehicleID, &vd.VehicleRegistrationNo, &vd.DepartmentID, &vd.DepartmentName, &vd.CreatedAt); err == nil {
			list = append(list, vd)
		}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    list,
	})
}

// CreateVehicleDepartment inserts a new vehicle-department association.
func (h *Handler) CreateVehicleDepartment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	var req struct {
		VehicleID    int `json:"vehicle_id"`
		DepartmentID int `json:"department_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}
	if req.VehicleID == 0 || req.DepartmentID == 0 {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Both vehicle_id and department_id are required"})
		return
	}

	var vdID int
	err := db.QueryRow(ctx, `
		INSERT INTO vehicle_departments (vehicle_id, department_id)
		VALUES ($1, $2)
		RETURNING id
	`, req.VehicleID, req.DepartmentID).Scan(&vdID)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to map vehicle to department: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"id":      vdID,
	})
}

// UpdateVehicleDepartment updates a mapping's details.
func (h *Handler) UpdateVehicleDepartment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	var req struct {
		VehicleID    int `json:"vehicle_id"`
		DepartmentID int `json:"department_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}
	if req.VehicleID == 0 || req.DepartmentID == 0 {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Both vehicle_id and department_id are required"})
		return
	}

	_, err = db.Exec(ctx, `
		UPDATE vehicle_departments
		SET vehicle_id = $1, department_id = $2
		WHERE id = $3
	`, req.VehicleID, req.DepartmentID, id)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update vehicle department: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}

// DeleteVehicleDepartment removes a vehicle-department association.
func (h *Handler) DeleteVehicleDepartment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	_, err = db.Exec(ctx, "DELETE FROM vehicle_departments WHERE id = $1", id)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete mapping: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}
