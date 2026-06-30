package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

type DesignationResponse struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	IsActive  bool   `json:"is_active"`
	CreatedAt string `json:"created_at"`
}

// GetDesignations returns a paginated list of designations.
func (h *Handler) GetDesignations(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	isAll := r.URL.Query().Get("all") == "true" || r.URL.Query().Get("page_size") == "-1"

	var total int
	err := db.QueryRow(ctx, `SELECT COUNT(*) FROM designations`).Scan(&total)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to count designations: " + err.Error()})
		return
	}

	var rows pgx.Rows
	var qerr error

	if isAll {
		rows, qerr = db.Query(ctx, `
			SELECT id, name, COALESCE(is_active, true), TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS')
			FROM designations
			ORDER BY id ASC
		`)
	} else {
		page, pageSize := parsePagination(r)
		offset := (page - 1) * pageSize
		rows, qerr = db.Query(ctx, `
			SELECT id, name, COALESCE(is_active, true), TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS')
			FROM designations
			ORDER BY id ASC
			LIMIT $1 OFFSET $2
		`, pageSize, offset)
	}

	if qerr != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query designations: " + qerr.Error()})
		return
	}
	defer rows.Close()

	var list []DesignationResponse = []DesignationResponse{}
	for rows.Next() {
		var des DesignationResponse
		if err := rows.Scan(&des.ID, &des.Name, &des.IsActive, &des.CreatedAt); err == nil {
			list = append(list, des)
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

// CreateDesignation inserts a new designation.
func (h *Handler) CreateDesignation(w http.ResponseWriter, r *http.Request) {
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
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Designation name is required"})
		return
	}

	var desID int
	err := db.QueryRow(ctx, `
		INSERT INTO designations (name)
		VALUES ($1)
		RETURNING id
	`, req.Name).Scan(&desID)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create designation: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"id":      desID,
	})
}

// UpdateDesignation updates a designation's name.
func (h *Handler) UpdateDesignation(w http.ResponseWriter, r *http.Request) {
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
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Designation name is required"})
		return
	}

	_, err = db.Exec(ctx, `
		UPDATE designations
		SET name = $1
		WHERE id = $2
	`, req.Name, id)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update designation: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}

// DeleteDesignation removes a designation from the database.
func (h *Handler) DeleteDesignation(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	_, err = db.Exec(ctx, "DELETE FROM designations WHERE id = $1", id)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete designation: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}
