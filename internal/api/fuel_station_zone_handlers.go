package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

type FuelStationZoneResponse struct {
	ID              int    `json:"id"`
	FuelStationID   int    `json:"fuel_station_id"`
	FuelStationName string `json:"fuel_station_name"`
	ZoneID          int    `json:"zone_id"`
	ZoneName        string `json:"zone_name"`
	CreatedAt       string `json:"created_at"`
}

func (h *Handler) GetFuelStationZones(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	query := `
		SELECT 
			fsz.id, 
			fsz.fuel_station_id, 
			fs.name, 
			fsz.zone_id, 
			r.region_name,
			TO_CHAR(fsz.created_at, 'YYYY-MM-DD HH24:MI:SS')
		FROM fuel_station_zones fsz
		JOIN fuel_stations fs ON fsz.fuel_station_id = fs.id
		JOIN regions r ON fsz.zone_id = r.id
		ORDER BY fsz.id DESC
	`
	rows, err := db.Query(ctx, query)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query fuel station zones: " + err.Error()})
		return
	}
	defer rows.Close()

	var mappings []FuelStationZoneResponse
	for rows.Next() {
		var mapping FuelStationZoneResponse
		if err := rows.Scan(&mapping.ID, &mapping.FuelStationID, &mapping.FuelStationName, &mapping.ZoneID, &mapping.ZoneName, &mapping.CreatedAt); err == nil {
			mappings = append(mappings, mapping)
		}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    mappings,
	})
}

func (h *Handler) CreateFuelStationZone(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	var req struct {
		FuelStationID int `json:"fuel_station_id"`
		ZoneID        int `json:"zone_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload: " + err.Error()})
		return
	}

	if req.FuelStationID == 0 || req.ZoneID == 0 {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Fuel Station and Zone are required"})
		return
	}

	var id int
	err := db.QueryRow(ctx, `
		INSERT INTO fuel_station_zones (fuel_station_id, zone_id)
		VALUES ($1, $2)
		RETURNING id
	`, req.FuelStationID, req.ZoneID).Scan(&id)

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create fuel station zone mapping: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"id":      id,
	})
}

func (h *Handler) DeleteFuelStationZone(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	_, err = db.Exec(ctx, "DELETE FROM fuel_station_zones WHERE id = $1", id)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete mapping: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}
