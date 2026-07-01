package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

type RouteTypeVehicleType struct {
	ID              int    `json:"id"`
	RouteTypeID     int    `json:"route_type_id"`
	RouteTypeName   string `json:"route_type_name"`
	VehicleTypeID   int    `json:"vehicle_type_id"`
	VehicleTypeName string `json:"vehicle_type_name"`
}

func (h *Handler) GetRouteTypeVehicleTypes(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	query := `
		SELECT rtvt.id, rtvt.route_type_id, rt.name, rtvt.vehicle_type_id, vt.vehicle_type_name
		FROM route_type_vehicle_types rtvt
		JOIN route_types_swift rt ON rtvt.route_type_id = rt.id
		JOIN vehicle_types_swift vt ON rtvt.vehicle_type_id = vt.id
		ORDER BY rtvt.id ASC
	`
	rows, err := db.Query(ctx, query)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch route type-vehicle types: " + err.Error()})
		return
	}
	defer rows.Close()

	var list []RouteTypeVehicleType
	for rows.Next() {
		var rtvt RouteTypeVehicleType
		if err := rows.Scan(&rtvt.ID, &rtvt.RouteTypeID, &rtvt.RouteTypeName, &rtvt.VehicleTypeID, &rtvt.VehicleTypeName); err == nil {
			list = append(list, rtvt)
		}
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": list})
}

func (h *Handler) CreateRouteTypeVehicleType(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	var body struct {
		RouteTypeID   int `json:"route_type_id"`
		VehicleTypeID int `json:"vehicle_type_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}
	if body.RouteTypeID == 0 || body.VehicleTypeID == 0 {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "route_type_id and vehicle_type_id are required"})
		return
	}

	_, err := db.Exec(ctx, `
		INSERT INTO route_type_vehicle_types (route_type_id, vehicle_type_id) VALUES ($1, $2)
		ON CONFLICT (route_type_id, vehicle_type_id) DO NOTHING
	`, body.RouteTypeID, body.VehicleTypeID)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to assign route type to vehicle type: " + err.Error()})
		return
	}
	sendJSON(w, http.StatusCreated, map[string]interface{}{"success": true})
}

func (h *Handler) DeleteRouteTypeVehicleType(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	_, err = db.Exec(ctx, `DELETE FROM route_type_vehicle_types WHERE id = $1`, id)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete mapping: " + err.Error()})
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}
