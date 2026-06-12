package api

import (
	"encoding/json"
	"fmt"
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

	// Validate if vehicle is already assigned to a route, and that the route's ward belongs to the requested zone.
	var assignedRouteName, assignedWardName, assignedZoneName string
	var assignedZoneID int
	
	validationQuery := `
		SELECT r.route_name, w.region_name as ward_name, z.id as zone_id, z.region_name as zone_name
		FROM vehicle_route_assignments va
		JOIN routes r ON va.route_id = r.id
		JOIN route_wards rw ON r.id = rw.route_id
		JOIN regions w ON rw.ward_id = w.id
		JOIN regions z ON w.parent_id = z.id
		WHERE va.vehicle_id = $1 AND va.is_active = true
		ORDER BY va.assigned_date DESC, va.id DESC
		LIMIT 1
	`
	valErr := db.QueryRow(ctx, validationQuery, req.VehicleID).Scan(&assignedRouteName, &assignedWardName, &assignedZoneID, &assignedZoneName)
	if valErr == nil {
		// Vehicle has active route assignment. Check if zone matches.
		if assignedZoneID != req.RegionID {
			sendJSON(w, http.StatusBadRequest, map[string]string{
				"error": fmt.Sprintf("Vehicle is assigned to Route '%s' (Ward '%s') in '%s'. You must select '%s'.", 
					assignedRouteName, assignedWardName, assignedZoneName, assignedZoneName),
			})
			return
		}
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

	// Sync the zone back to the vehicle's default zone_id
	_, _ = db.Exec(ctx, "UPDATE vehicles SET zone_id = $1 WHERE id = $2", req.RegionID, req.VehicleID)

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

	// Fetch vehicle_id before deleting to sync
	var vehicleID int
	_ = db.QueryRow(ctx, "SELECT vehicle_id FROM vehicle_regions WHERE id = $1", id).Scan(&vehicleID)

	_, err = db.Exec(ctx, "DELETE FROM vehicle_regions WHERE id = $1", id)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete assignment: " + err.Error()})
		return
	}

	if vehicleID > 0 {
		_, _ = db.Exec(ctx, "UPDATE vehicles SET zone_id = NULL WHERE id = $1", vehicleID)
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}
