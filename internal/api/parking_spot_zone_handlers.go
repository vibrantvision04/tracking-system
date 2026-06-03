package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

type ParkingSpotZoneResponse struct {
	ID            int    `json:"id"`
	ParkingSpotID int    `json:"parking_spot_id"`
	ParkingSpot   string `json:"parking_spot"`
	RegionID      int    `json:"region_id"`
	RegionName    string `json:"region_name"`
}

func (h *Handler) GetParkingSpotZones(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	query := `
		SELECT 
			pz.id, 
			pz.parking_spot_id, 
			p.parking_lot_name, 
			pz.region_id, 
			r.region_name
		FROM parking_spot_regions pz
		JOIN parking_lots p ON pz.parking_spot_id = p.id
		JOIN regions r ON pz.region_id = r.id
		ORDER BY pz.id ASC
	`
	rows, err := db.Query(ctx, query)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query assignments: " + err.Error()})
		return
	}
	defer rows.Close()

	var list []ParkingSpotZoneResponse
	for rows.Next() {
		var item ParkingSpotZoneResponse
		if err := rows.Scan(&item.ID, &item.ParkingSpotID, &item.ParkingSpot, &item.RegionID, &item.RegionName); err == nil {
			list = append(list, item)
		}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    list,
	})
}

func (h *Handler) CreateParkingSpotZone(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	var req struct {
		ParkingSpotID int `json:"parking_spot_id"`
		RegionID      int `json:"region_id"` // This can be Zone or Ward
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload: " + err.Error()})
		return
	}

	if req.ParkingSpotID <= 0 || req.RegionID <= 0 {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Parking spot and Region are required"})
		return
	}

	_, err := db.Exec(ctx, `
		INSERT INTO parking_spot_regions (parking_spot_id, region_id) 
		VALUES ($1, $2)
		ON CONFLICT (parking_spot_id, region_id) DO NOTHING
	`, req.ParkingSpotID, req.RegionID)

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create assignment: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusCreated, map[string]interface{}{"success": true})
}

func (h *Handler) DeleteParkingSpotZone(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	_, err = db.Exec(ctx, "DELETE FROM parking_spot_regions WHERE id = $1", id)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete assignment: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}
