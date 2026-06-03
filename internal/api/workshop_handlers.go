package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

type WorkshopResponse struct {
	ID         int             `json:"id"`
	Name       string          `json:"name"`
	Code       string          `json:"code"`
	Address    string          `json:"address"`
	GeofenceID *int            `json:"geofence_id"`
	CreatedAt  string          `json:"created_at"`
	GeoJSON    json.RawMessage `json:"geojson"`
	Color      string          `json:"color"`
}

func (h *Handler) GetWorkshops(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	query := `
		SELECT 
			w.id, 
			w.name, 
			COALESCE(w.code, ''),
			COALESCE(w.address, ''), 
			w.geofence_id, 
			TO_CHAR(w.created_at, 'YYYY-MM-DD HH24:MI:SS'),
			g.polygon,
			COALESCE(g.color, '#000000')
		FROM workshops w
		LEFT JOIN geofences g ON w.geofence_id = g.id
		ORDER BY w.id DESC
	`
	rows, err := db.Query(ctx, query)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query workshops: " + err.Error()})
		return
	}
	defer rows.Close()

	var workshops []WorkshopResponse
	for rows.Next() {
		var ws WorkshopResponse
		var polygonStr *string
		err := rows.Scan(
			&ws.ID,
			&ws.Name,
			&ws.Code,
			&ws.Address,
			&ws.GeofenceID,
			&ws.CreatedAt,
			&polygonStr,
			&ws.Color,
		)
		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to scan workshop"})
			return
		}

		if polygonStr != nil && *polygonStr != "" {
			ws.GeoJSON = json.RawMessage(*polygonStr)
		} else {
			ws.GeoJSON = json.RawMessage(`null`)
		}

		workshops = append(workshops, ws)
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    workshops,
	})
}

func (h *Handler) CreateWorkshop(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	var req struct {
		Name    string          `json:"name"`
		Code    string          `json:"code"`
		Address string          `json:"address"`
		GeoJSON json.RawMessage `json:"geojson"`
		Color   string          `json:"color"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if req.Name == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Workshop name is required"})
		return
	}

	tx, err := db.Begin(ctx)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to start transaction"})
		return
	}
	defer tx.Rollback(ctx)

	var geofenceID *int
	if len(req.GeoJSON) > 0 && string(req.GeoJSON) != "null" && string(req.GeoJSON) != `""` {
		color := req.Color
		if color == "" {
			color = "#9333ea" // Default purple
		}
		err = tx.QueryRow(ctx, `
			INSERT INTO geofences (name, type, polygon, color) 
			VALUES ($1, 'Workshop', $2, $3) 
			RETURNING id
		`, req.Name, string(req.GeoJSON), color).Scan(&geofenceID)
		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create geofence"})
			return
		}
	}

	var wsID int
	err = tx.QueryRow(ctx, `
		INSERT INTO workshops (name, code, address, geofence_id)
		VALUES ($1, $2, $3, $4)
		RETURNING id
	`, req.Name, req.Code, req.Address, geofenceID).Scan(&wsID)

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create workshop"})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to commit transaction"})
		return
	}

	sendJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"message": "Workshop created successfully",
		"id":      wsID,
	})
}

func (h *Handler) UpdateWorkshop(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	var req struct {
		Name    string          `json:"name"`
		Code    string          `json:"code"`
		Address string          `json:"address"`
		GeoJSON json.RawMessage `json:"geojson"`
		Color   string          `json:"color"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	tx, err := db.Begin(ctx)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to start transaction"})
		return
	}
	defer tx.Rollback(ctx)

	var currentGeofenceID *int
	err = tx.QueryRow(ctx, "SELECT geofence_id FROM workshops WHERE id = $1", id).Scan(&currentGeofenceID)
	if err != nil {
		sendJSON(w, http.StatusNotFound, map[string]string{"error": "Workshop not found"})
		return
	}

	if len(req.GeoJSON) > 0 && string(req.GeoJSON) != "null" && string(req.GeoJSON) != `""` {
		color := req.Color
		if color == "" {
			color = "#9333ea"
		}
		if currentGeofenceID != nil {
			_, err = tx.Exec(ctx, `
				UPDATE geofences SET polygon = $1, color = $2, name = $3 WHERE id = $4
			`, string(req.GeoJSON), color, req.Name, *currentGeofenceID)
		} else {
			err = tx.QueryRow(ctx, `
				INSERT INTO geofences (name, type, polygon, color) 
				VALUES ($1, 'Workshop', $2, $3) 
				RETURNING id
			`, req.Name, string(req.GeoJSON), color).Scan(&currentGeofenceID)
		}
		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update geofence"})
			return
		}
	} else if currentGeofenceID != nil {
		_, err = tx.Exec(ctx, "DELETE FROM geofences WHERE id = $1", *currentGeofenceID)
		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to remove geofence"})
			return
		}
		currentGeofenceID = nil
	}

	_, err = tx.Exec(ctx, `
		UPDATE workshops 
		SET name = $1, code = $2, address = $3, geofence_id = $4, updated_at = CURRENT_TIMESTAMP
		WHERE id = $5
	`, req.Name, req.Code, req.Address, currentGeofenceID, id)

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update workshop"})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to commit transaction"})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Workshop updated successfully",
	})
}

func (h *Handler) DeleteWorkshop(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	var geofenceID *int
	err = db.QueryRow(ctx, "SELECT geofence_id FROM workshops WHERE id = $1", id).Scan(&geofenceID)
	if err != nil {
		sendJSON(w, http.StatusNotFound, map[string]string{"error": "Workshop not found"})
		return
	}

	tx, err := db.Begin(ctx)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to start transaction"})
		return
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, "DELETE FROM workshops WHERE id = $1", id)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete workshop"})
		return
	}

	if geofenceID != nil {
		_, err = tx.Exec(ctx, "DELETE FROM geofences WHERE id = $1", *geofenceID)
		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete associated geofence"})
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to commit transaction"})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Workshop deleted successfully",
	})
}
