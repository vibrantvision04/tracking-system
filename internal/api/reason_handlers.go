package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
)

type ReasonResponse struct {
	ID          int       `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Snooze      bool      `json:"snooze"`
	Status      bool      `json:"status"`
	ReasonText  bool      `json:"reason_text"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (h *Handler) GetReasons(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	rows, err := db.Query(ctx, `
		SELECT id, name, description, snooze, status, reason_text, created_at, updated_at
		FROM reasons
		ORDER BY id ASC
	`)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch reasons: " + err.Error()})
		return
	}
	defer rows.Close()

	var list []ReasonResponse = []ReasonResponse{}
	for rows.Next() {
		var reas ReasonResponse
		err := rows.Scan(
			&reas.ID, &reas.Name, &reas.Description, 
			&reas.Snooze, &reas.Status, &reas.ReasonText, 
			&reas.CreatedAt, &reas.UpdatedAt,
		)
		if err == nil {
			list = append(list, reas)
		}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": list})
}

func (h *Handler) CreateReason(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Snooze      bool   `json:"snooze"`
		Status      bool   `json:"status"`
		ReasonText  bool   `json:"reason_text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}
	if req.Name == "" || req.Description == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Name and Description are required"})
		return
	}

	var id int
	query := `
		INSERT INTO reasons (name, description, snooze, status, reason_text)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (name) DO UPDATE SET 
			description = $2,
			snooze = $3,
			status = $4,
			reason_text = $5,
			updated_at = NOW()
		RETURNING id
	`
	err := db.QueryRow(ctx, query, req.Name, req.Description, req.Snooze, req.Status, req.ReasonText).Scan(&id)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create reason: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusCreated, map[string]interface{}{"success": true, "id": id})
}

func (h *Handler) UpdateReason(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Snooze      bool   `json:"snooze"`
		Status      bool   `json:"status"`
		ReasonText  bool   `json:"reason_text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}
	if req.Name == "" || req.Description == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Name and Description are required"})
		return
	}

	_, err = db.Exec(ctx, `
		UPDATE reasons 
		SET name = $1, description = $2, snooze = $3, status = $4, reason_text = $5, updated_at = NOW()
		WHERE id = $6
	`, req.Name, req.Description, req.Snooze, req.Status, req.ReasonText, id)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update reason: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *Handler) DeleteReason(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	_, err = db.Exec(ctx, `DELETE FROM reasons WHERE id = $1`, id)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete reason: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}
