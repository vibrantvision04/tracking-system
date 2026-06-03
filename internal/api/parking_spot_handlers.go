package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

type ParkingSpotResponse struct {
	ID            int             `json:"id"`
	Name          string          `json:"name"`
	Address       string          `json:"address"`
	ContactNumber string          `json:"contact_number"`
	GeofenceID    *int            `json:"geofence_id"`
	IsActive      bool            `json:"is_active"`
	CreatedAt     string          `json:"created_at"`
	GeoJSON       json.RawMessage `json:"geojson"`
	Color         string          `json:"color"`
}

func (h *Handler) GetParkingSpots(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	query := `
		SELECT 
			p.id, 
			p.parking_lot_name, 
			COALESCE(p.address, ''), 
			COALESCE(p.contact_no, ''), 
			p.geofence_id, 
			COALESCE(p.is_active, true),
			TO_CHAR(p.created_at, 'YYYY-MM-DD HH24:MI:SS'),
			g.polygon,
			COALESCE(g.color, '#000000')
		FROM parking_lots p
		LEFT JOIN geofences g ON p.geofence_id = g.id
		ORDER BY p.id DESC
	`
	rows, err := db.Query(ctx, query)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query parking spots: " + err.Error()})
		return
	}
	defer rows.Close()

	var spots []ParkingSpotResponse
	for rows.Next() {
		var p ParkingSpotResponse
		var geojson []byte
		err := rows.Scan(&p.ID, &p.Name, &p.Address, &p.ContactNumber, &p.GeofenceID, &p.IsActive, &p.CreatedAt, &geojson, &p.Color)
		if err == nil {
			if len(geojson) > 0 {
				p.GeoJSON = json.RawMessage(geojson)
			} else {
				p.GeoJSON = json.RawMessage("null")
			}
			spots = append(spots, p)
		} else {
			fmt.Printf("Error scanning parking spot: %v\n", err)
		}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    spots,
	})
}

func (h *Handler) CreateParkingSpot(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	var req struct {
		Name          string          `json:"name"`
		Address       string          `json:"address"`
		ContactNumber string          `json:"contact_number"`
		GeoJSON       json.RawMessage `json:"geojson"`
		Color         string          `json:"color"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload: " + err.Error()})
		return
	}

	if req.Name == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Parking spot name is required"})
		return
	}

	// 1. Create geofence if GeoJSON is provided
	var geofenceID *int
	if len(req.GeoJSON) > 0 && string(req.GeoJSON) != "null" && string(req.GeoJSON) != "" {
		var gID int
		geofenceColor := req.Color
		if geofenceColor == "" {
			geofenceColor = "#000000"
		}
		err := db.QueryRow(ctx, `
			INSERT INTO geofences (name, type, polygon, color)
			VALUES ($1, 'polygon', $2::jsonb, $3)
			RETURNING id
		`, req.Name+"_geom", req.GeoJSON, geofenceColor).Scan(&gID)

		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create geofence geometry: " + err.Error()})
			return
		}
		geofenceID = &gID
	}

	// 2. Create parking spot
	var spotID int
	err := db.QueryRow(ctx, `
		INSERT INTO parking_lots (parking_lot_name, address, contact_no, geofence_id)
		VALUES ($1, $2, $3, $4)
		RETURNING id
	`, req.Name, req.Address, req.ContactNumber, geofenceID).Scan(&spotID)

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create parking spot: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"id":      spotID,
	})
}

func (h *Handler) UpdateParkingSpot(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	var req struct {
		Name          string          `json:"name"`
		Address       string          `json:"address"`
		ContactNumber string          `json:"contact_number"`
		GeoJSON       json.RawMessage `json:"geojson"`
		Color         string          `json:"color"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload: " + err.Error()})
		return
	}

	if req.Name == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Parking spot name is required"})
		return
	}

	// 1. Get current geofence ID
	var currentGeofenceID *int
	err = db.QueryRow(ctx, "SELECT geofence_id FROM parking_lots WHERE id = $1", id).Scan(&currentGeofenceID)
	if err != nil {
		sendJSON(w, http.StatusNotFound, map[string]string{"error": "Parking spot not found"})
		return
	}

	// 2. Handle Geofence Update/Create
	var newGeofenceID *int = currentGeofenceID
	if len(req.GeoJSON) > 0 && string(req.GeoJSON) != "null" && string(req.GeoJSON) != "" {
		geofenceColor := req.Color
		if geofenceColor == "" {
			geofenceColor = "#000000"
		}

		if currentGeofenceID != nil {
			// Update existing geofence
			_, err = db.Exec(ctx, `
				UPDATE geofences 
				SET name = $1, polygon = $2::jsonb, color = $3
				WHERE id = $4
			`, req.Name+"_geom", req.GeoJSON, geofenceColor, *currentGeofenceID)
			
			if err != nil {
				sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update geofence: " + err.Error()})
				return
			}
		} else {
			// Create new geofence
			var gID int
			err := db.QueryRow(ctx, `
				INSERT INTO geofences (name, type, polygon, color)
				VALUES ($1, 'polygon', $2::jsonb, $3)
				RETURNING id
			`, req.Name+"_geom", req.GeoJSON, geofenceColor).Scan(&gID)

			if err != nil {
				sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create geofence: " + err.Error()})
				return
			}
			newGeofenceID = &gID
		}
	} else if currentGeofenceID != nil {
		// They cleared the GeoJSON, so delete the geofence
		_, err = db.Exec(ctx, "DELETE FROM geofences WHERE id = $1", *currentGeofenceID)
		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete old geofence: " + err.Error()})
			return
		}
		newGeofenceID = nullGeofence()
	}

	// 3. Update parking spot
	_, err = db.Exec(ctx, `
		UPDATE parking_lots 
		SET parking_lot_name = $1, address = $2, contact_no = $3, geofence_id = $4
		WHERE id = $5
	`, req.Name, req.Address, req.ContactNumber, newGeofenceID, id)

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update parking spot: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}

func nullGeofence() *int { return nil }

func (h *Handler) DeleteParkingSpot(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	// First get the geofence_id
	var geofenceID *int
	err = db.QueryRow(ctx, "SELECT geofence_id FROM parking_lots WHERE id = $1", id).Scan(&geofenceID)
	if err != nil {
		sendJSON(w, http.StatusNotFound, map[string]string{"error": "Parking spot not found"})
		return
	}

	// Delete parking spot
	_, err = db.Exec(ctx, "DELETE FROM parking_lots WHERE id = $1", id)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete parking spot: " + err.Error()})
		return
	}

	// Delete geofence
	if geofenceID != nil {
		_, _ = db.Exec(ctx, "DELETE FROM geofences WHERE id = $1", *geofenceID)
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}
