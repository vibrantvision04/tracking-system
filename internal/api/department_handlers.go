package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

type DepartmentResponse struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	IsActive  bool   `json:"is_active"`
	CreatedAt string `json:"created_at"`
}

// GetDepartments returns a paginated list of departments.
func (h *Handler) GetDepartments(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	isAll := r.URL.Query().Get("all") == "true" || r.URL.Query().Get("page_size") == "-1"

	var total int
	err := db.QueryRow(ctx, `SELECT COUNT(*) FROM departments`).Scan(&total)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to count departments: " + err.Error()})
		return
	}

	var rows pgx.Rows
	var qerr error

	if isAll {
		rows, qerr = db.Query(ctx, `
			SELECT id, name, COALESCE(is_active, true), TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS')
			FROM departments
			ORDER BY id ASC
		`)
	} else {
		page, pageSize := parsePagination(r)
		offset := (page - 1) * pageSize
		rows, qerr = db.Query(ctx, `
			SELECT id, name, COALESCE(is_active, true), TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS')
			FROM departments
			ORDER BY id ASC
			LIMIT $1 OFFSET $2
		`, pageSize, offset)
	}

	if qerr != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query departments: " + qerr.Error()})
		return
	}
	defer rows.Close()

	var list []DepartmentResponse = []DepartmentResponse{}
	for rows.Next() {
		var dept DepartmentResponse
		if err := rows.Scan(&dept.ID, &dept.Name, &dept.IsActive, &dept.CreatedAt); err == nil {
			list = append(list, dept)
		}
	}

	if isAll {
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"success":     true,
			"data":        list,
			"total":       total,
			"page":        1,
			"page_size":   total,
			"total_pages": 1,
		})
	} else {
		page, pageSize := parsePagination(r)
		totalPages := (total + pageSize - 1) / pageSize
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"success":     true,
			"data":        list,
			"total":       total,
			"page":        page,
			"page_size":   pageSize,
			"total_pages": totalPages,
		})
	}
}

// CreateDepartment inserts a new department.
func (h *Handler) CreateDepartment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}
	if req.Name == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Department name is required"})
		return
	}

	var deptID int
	err := db.QueryRow(ctx, `
		INSERT INTO departments (name)
		VALUES ($1)
		RETURNING id
	`, req.Name).Scan(&deptID)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create department: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"id":      deptID,
	})
}

// UpdateDepartment updates a department's name.
func (h *Handler) UpdateDepartment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}
	if req.Name == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Department name is required"})
		return
	}

	_, err = db.Exec(ctx, `
		UPDATE departments
		SET name = $1
		WHERE id = $2
	`, req.Name, id)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update department: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}

// DeleteDepartment removes a department from the database.
func (h *Handler) DeleteDepartment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	_, err = db.Exec(ctx, "DELETE FROM departments WHERE id = $1", id)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete department: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}
