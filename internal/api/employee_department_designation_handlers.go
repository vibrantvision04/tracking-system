package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
)

type EmployeeDepartmentDesignationResponse struct {
	ID              int       `json:"id"`
	EmployeeID      int       `json:"employee_id"`
	EmployeeName    string    `json:"employee_name"`
	DepartmentID    int       `json:"department_id"`
	DepartmentName  string    `json:"department_name"`
	DesignationID   int       `json:"designation_id"`
	DesignationName string    `json:"designation_name"`
	RegionID        int       `json:"region_id"`
	RegionName      string    `json:"region_name"`
	CreatedAt       time.Time `json:"created_at"`
}

func (h *Handler) GetEmployeeDepartmentDesignations(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	query := `
		SELECT 
			edd.id, 
			edd.employee_id, 
			CONCAT(e.first_name, ' ', CASE WHEN e.middle_name IS NOT NULL AND e.middle_name <> '' THEN e.middle_name || ' ' ELSE '' END, e.last_name, ' (', e.employee_id, ')') AS employee_name,
			edd.department_id, 
			d.name AS department_name, 
			edd.designation_id, 
			des.name AS designation_name, 
			edd.region_id, 
			reg.region_name, 
			edd.created_at
		FROM employee_department_designations edd
		JOIN employees e ON edd.employee_id = e.id
		JOIN departments d ON edd.department_id = d.id
		JOIN designations des ON edd.designation_id = des.id
		JOIN regions reg ON edd.region_id = reg.id
		ORDER BY edd.id DESC
	`
	rows, err := db.Query(ctx, query)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch assignments: " + err.Error()})
		return
	}
	defer rows.Close()

	var data []EmployeeDepartmentDesignationResponse = []EmployeeDepartmentDesignationResponse{}
	for rows.Next() {
		var edd EmployeeDepartmentDesignationResponse
		err := rows.Scan(
			&edd.ID, &edd.EmployeeID, &edd.EmployeeName,
			&edd.DepartmentID, &edd.DepartmentName,
			&edd.DesignationID, &edd.DesignationName,
			&edd.RegionID, &edd.RegionName, &edd.CreatedAt,
		)
		if err == nil {
			data = append(data, edd)
		}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    data,
	})
}

func (h *Handler) CreateEmployeeDepartmentDesignation(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	var req struct {
		EmployeeID    int `json:"employee_id"`
		DepartmentID  int `json:"department_id"`
		DesignationID int `json:"designation_id"`
		RegionID      int `json:"region_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}

	if req.EmployeeID == 0 || req.DepartmentID == 0 || req.DesignationID == 0 || req.RegionID == 0 {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "All fields are required"})
		return
	}

	var id int
	query := `
		INSERT INTO employee_department_designations (employee_id, department_id, designation_id, region_id)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (employee_id) DO UPDATE SET 
			department_id = $2,
			designation_id = $3,
			region_id = $4
		RETURNING id
	`
	err := db.QueryRow(ctx, query, req.EmployeeID, req.DepartmentID, req.DesignationID, req.RegionID).Scan(&id)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to assign employee: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"id":      id,
	})
}

func (h *Handler) DeleteEmployeeDepartmentDesignation(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	_, err = db.Exec(ctx, "DELETE FROM employee_department_designations WHERE id = $1", id)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete assignment: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}
