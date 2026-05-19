package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
)

type RouteResponse struct {
	ID             int             `json:"id"`
	RouteName      string          `json:"route_name"`
	Identification string          `json:"identification"`
	Distance       float64         `json:"distance"`
	RouteTypeID    int             `json:"route_type_id"`
	RouteTypeName  string          `json:"route_type_name"`
	GeometryID     *int            `json:"geometry_id,omitempty"`
	WardID         *int            `json:"ward_id,omitempty"`
	WardName       string          `json:"ward_name"`
	ShiftID        *int            `json:"shift_id,omitempty"`
	ShiftName      string          `json:"shift_name"`
	Lanes          json.RawMessage `json:"lanes"`
	IsActive       bool            `json:"is_active"`
	GeoJSON        string          `json:"geojson"`
	Color          string          `json:"color"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

type CreateRouteRequest struct {
	RouteName      string          `json:"route_name"`
	Identification string          `json:"identification"`
	Distance       float64         `json:"distance"`
	RouteTypeID    int             `json:"route_type_id"`
	WardID         *int            `json:"ward_id"`
	ShiftID        *int            `json:"shift_id"`
	GeoJSON        string          `json:"geojson"`
	Color          string          `json:"color"`
	Lanes          json.RawMessage `json:"lanes"`
}

func (h *Handler) GetRouteTypes(w http.ResponseWriter, r *http.Request) {
	types := []map[string]interface{}{
		{"id": 1, "name": "D2D"},
		{"id": 2, "name": "SWEEPING"},
		{"id": 3, "name": "DUSTBIN"},
		{"id": 4, "name": "COMMERCIAL"},
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success":     true,
		"status_code": 200,
		"data":        types,
	})
}

func (h *Handler) GetShifts(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	rows, err := h.gpsRepo.Pool().Query(ctx, `
		SELECT id, shift_name, 
		       COALESCE(start_time::text, ''), 
		       COALESCE(end_time::text, ''), 
		       COALESCE(time_duration, 0) 
		FROM shifts 
		ORDER BY id ASC
	`)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query shifts: " + err.Error()})
		return
	}
	defer rows.Close()

	var shifts []map[string]interface{}
	for rows.Next() {
		var id, duration int
		var name, startTime, endTime string
		if err := rows.Scan(&id, &name, &startTime, &endTime, &duration); err == nil {
			shifts = append(shifts, map[string]interface{}{
				"id":            id,
				"shift_name":    name,
				"name":          name,
				"start_time":    startTime,
				"end_time":      endTime,
				"time_duration": duration,
			})
		}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success":     true,
		"status_code": 200,
		"data":        shifts,
	})
}

func (h *Handler) GetRoutes(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	query := `
		SELECT 
			r.id, 
			COALESCE(r.route_name, ''), 
			COALESCE(r.identification, ''), 
			COALESCE(r.distance, 0.0), 
			COALESCE(r.route_type_id, 1), 
			r.geometry_id, 
			r.ward_id, 
			r.shift_id, 
			r.lanes, 
			COALESCE(r.is_active, true),
			COALESCE(r.created_at, NOW()),
			COALESCE(w.region_name, ''),
			COALESCE(s.shift_name, ''),
			COALESCE(g.polygon::text, ''),
			COALESCE(g.color, '')
		FROM routes r
		LEFT JOIN regions w ON r.ward_id = w.id
		LEFT JOIN shifts s ON r.shift_id = s.id
		LEFT JOIN geofences g ON r.geometry_id = g.id
		ORDER BY r.id DESC
	`

	rows, err := h.gpsRepo.Pool().Query(ctx, query)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query routes: " + err.Error()})
		return
	}
	defer rows.Close()

	routeTypeNames := map[int]string{
		1: "D2D",
		2: "SWEEPING",
		3: "DUSTBIN",
		4: "COMMERCIAL",
	}

	routes := []RouteResponse{}
	for rows.Next() {
		var r RouteResponse
		var lanes []byte
		if err := rows.Scan(
			&r.ID, &r.RouteName, &r.Identification, &r.Distance, &r.RouteTypeID,
			&r.GeometryID, &r.WardID, &r.ShiftID, &lanes, &r.IsActive, &r.UpdatedAt,
			&r.WardName, &r.ShiftName, &r.GeoJSON, &r.Color,
		); err == nil {
			r.RouteTypeName = routeTypeNames[r.RouteTypeID]
			if r.RouteTypeName == "" {
				r.RouteTypeName = "D2D"
			}
			if len(lanes) > 0 {
				r.Lanes = json.RawMessage(lanes)
			} else {
				r.Lanes = json.RawMessage("[]")
			}
			routes = append(routes, r)
		} else {
			fmt.Printf("Error scanning route: %v\n", err)
		}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success":     true,
		"status_code": 200,
		"data":        routes,
	})
}

func (h *Handler) CreateRoute(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var req CreateRouteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON body: " + err.Error()})
		return
	}

	var geometryID *int
	if req.GeoJSON != "" {
		var geomID int
		err := h.gpsRepo.Pool().QueryRow(ctx, `
			INSERT INTO geofences (name, type, polygon, color)
			VALUES ($1, 'line', $2::jsonb, $3)
			RETURNING id
		`, req.RouteName+"_geom", req.GeoJSON, req.Color).Scan(&geomID)
		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create route geofence: " + err.Error()})
			return
		}
		geometryID = &geomID
	}

	lanesJSON := []byte("[]")
	if len(req.Lanes) > 0 {
		lanesJSON = req.Lanes
	}

	var routeID int
	err := h.gpsRepo.Pool().QueryRow(ctx, `
		INSERT INTO routes (route_name, identification, distance, route_type_id, geometry_id, ward_id, shift_id, lanes, is_active)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, true)
		RETURNING id
	`, req.RouteName, req.Identification, req.Distance, req.RouteTypeID, geometryID, req.WardID, req.ShiftID, lanesJSON).Scan(&routeID)

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create route: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"id":      routeID,
	})
}

func (h *Handler) UpdateRoute(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	idStr := chi.URLParam(r, "id")
	routeID, err := strconv.Atoi(idStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid route ID"})
		return
	}

	var req CreateRouteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON body: " + err.Error()})
		return
	}

	// 1. Fetch current geometry_id
	var geometryID *int
	err = h.gpsRepo.Pool().QueryRow(ctx, "SELECT geometry_id FROM routes WHERE id = $1", routeID).Scan(&geometryID)
	if err != nil {
		sendJSON(w, http.StatusNotFound, map[string]string{"error": "Route not found: " + err.Error()})
		return
	}

	// 2. Handle geometry update
	if req.GeoJSON != "" {
		if geometryID != nil {
			_, err = h.gpsRepo.Pool().Exec(ctx, `
				UPDATE geofences 
				SET polygon = $1::jsonb, color = $2, name = $3
				WHERE id = $4
			`, req.GeoJSON, req.Color, req.RouteName+"_geom", *geometryID)
			if err != nil {
				sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update geofence: " + err.Error()})
				return
			}
		} else {
			var geomID int
			err = h.gpsRepo.Pool().QueryRow(ctx, `
				INSERT INTO geofences (name, type, polygon, color)
				VALUES ($1, 'line', $2::jsonb, $3)
				RETURNING id
			`, req.RouteName+"_geom", req.GeoJSON, req.Color).Scan(&geomID)
			if err != nil {
				sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create geofence: " + err.Error()})
				return
			}
			geometryID = &geomID
		}
	} else if geometryID != nil {
		// If geometry was cleared
		_, err = h.gpsRepo.Pool().Exec(ctx, "UPDATE routes SET geometry_id = NULL WHERE id = $1", routeID)
		_, _ = h.gpsRepo.Pool().Exec(ctx, "DELETE FROM geofences WHERE id = $1", *geometryID)
		geometryID = nil
	}

	lanesJSON := []byte("[]")
	if len(req.Lanes) > 0 {
		lanesJSON = req.Lanes
	}

	// 3. Update route details
	_, err = h.gpsRepo.Pool().Exec(ctx, `
		UPDATE routes 
		SET route_name = $1, identification = $2, distance = $3, 
		    route_type_id = $4, geometry_id = $5, ward_id = $6, 
		    shift_id = $7, lanes = $8::jsonb
		WHERE id = $9
	`, req.RouteName, req.Identification, req.Distance, req.RouteTypeID, geometryID, req.WardID, req.ShiftID, lanesJSON, routeID)

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update route: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}

func (h *Handler) DeleteRoute(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	idStr := chi.URLParam(r, "id")
	routeID, err := strconv.Atoi(idStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid route ID"})
		return
	}

	// Fetch current geometry_id
	var geometryID *int
	_ = h.gpsRepo.Pool().QueryRow(ctx, "SELECT geometry_id FROM routes WHERE id = $1", routeID).Scan(&geometryID)

	// Delete from routes
	_, err = h.gpsRepo.Pool().Exec(ctx, "DELETE FROM routes WHERE id = $1", routeID)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete route: " + err.Error()})
		return
	}

	// Delete associated geofence if present
	if geometryID != nil {
		_, _ = h.gpsRepo.Pool().Exec(ctx, "DELETE FROM geofences WHERE id = $1", *geometryID)
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}
