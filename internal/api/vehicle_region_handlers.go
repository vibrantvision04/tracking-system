package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
)

type VehicleRegionResponse struct {
	ID          int       `json:"id"`
	VehicleID   int       `json:"vehicle_id"`
	VehicleName string    `json:"vehicle_name"` // e.g., registration_no
	RegionID    int       `json:"region_id"`
	RegionName  string    `json:"region_name"`
	CreatedAt   time.Time `json:"created_at"`
}

func (h *Handler) GetVehicleRegions(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	query := `
		SELECT vr.id, vr.vehicle_id, v.registration_no, vr.region_id, r.region_name, vr.created_at
		FROM vehicle_regions vr
		JOIN vehicles v ON vr.vehicle_id = v.id
		JOIN regions r ON vr.region_id = r.id
		ORDER BY vr.id DESC
	`
	rows, err := db.Query(ctx, query)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch vehicle regions: " + err.Error()})
		return
	}
	defer rows.Close()

	var data []VehicleRegionResponse
	for rows.Next() {
		var vr VehicleRegionResponse
		if err := rows.Scan(&vr.ID, &vr.VehicleID, &vr.VehicleName, &vr.RegionID, &vr.RegionName, &vr.CreatedAt); err == nil {
			data = append(data, vr)
		}
	}

	if data == nil {
		data = []VehicleRegionResponse{}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    data,
	})
}

func (h *Handler) AssignVehicleRegion(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	var req struct {
		VehicleID int `json:"vehicle_id"`
		RegionID  int `json:"region_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}

	// Insert or Update the existing assignment for this vehicle due to UNIQUE(vehicle_id)
	var id int
	query := `
		INSERT INTO vehicle_regions (vehicle_id, region_id)
		VALUES ($1, $2)
		ON CONFLICT (vehicle_id) DO UPDATE SET region_id = $2
		RETURNING id
	`
	err := db.QueryRow(ctx, query, req.VehicleID, req.RegionID).Scan(&id)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to assign vehicle to region: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"id":      id,
	})
}

func (h *Handler) RemoveVehicleRegion(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	_, err = db.Exec(ctx, "DELETE FROM vehicle_regions WHERE id = $1", id)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete assignment: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}
