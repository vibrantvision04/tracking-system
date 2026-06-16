package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"gps-tracking-system/internal/repository"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
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

// GetRouteTypes returns all route types from the database.
func (h *Handler) GetRouteTypes(w http.ResponseWriter, r *http.Request) {
	types, err := h.routeRepo.GetAllRouteTypes(r.Context())
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch route types: " + err.Error()})
		return
	}
	if types == nil {
		types = []repository.RouteType{}
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success":     true,
		"status_code": 200,
		"data":        types,
	})
}

// CreateRouteType creates a new route type.
func (h *Handler) CreateRouteType(w http.ResponseWriter, r *http.Request) {
	var rt repository.RouteType
	if err := json.NewDecoder(r.Body).Decode(&rt); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}
	if rt.Name == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Route type name is required"})
		return
	}
	if err := h.routeRepo.CreateRouteType(r.Context(), &rt); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create route type: " + err.Error()})
		return
	}
	sendJSON(w, http.StatusCreated, map[string]interface{}{"success": true, "data": rt})
}

// UpdateRouteType updates a route type name.
func (h *Handler) UpdateRouteType(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}
	if body.Name == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Name is required"})
		return
	}
	if err := h.routeRepo.UpdateRouteType(r.Context(), id, body.Name); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update route type: " + err.Error()})
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

// DeleteRouteType deletes a route type (and nullifies FK on routes).
func (h *Handler) DeleteRouteType(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}
	if err := h.routeRepo.DeleteRouteType(r.Context(), id); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete route type: " + err.Error()})
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *Handler) GetShifts(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	group := r.URL.Query().Get("group")
	if group == "" {
		group = r.URL.Query().Get("report_type")
	}
	reportTypeIDStr := r.URL.Query().Get("report_type_id")

	var rows pgx.Rows
	var err error

	if group != "" {
		rows, err = h.gpsRepo.Pool().Query(ctx, `
			SELECT s.id, s.shift_name, 
			       COALESCE(s.start_time::text, ''), 
			       COALESCE(s.end_time::text, ''), 
			       COALESCE(s.time_duration, 0),
			       s.report_type_id
			FROM shifts s
			JOIN report_types rt ON s.report_type_id = rt.id
			WHERE rt.name = $1 AND s.is_active = true
			ORDER BY s.id ASC
		`, group)
	} else if reportTypeIDStr != "" {
		id, _ := strconv.Atoi(reportTypeIDStr)
		rows, err = h.gpsRepo.Pool().Query(ctx, `
			SELECT id, shift_name, 
			       COALESCE(start_time::text, ''), 
			       COALESCE(end_time::text, ''), 
			       COALESCE(time_duration, 0),
			       report_type_id
			FROM shifts 
			WHERE report_type_id = $1 AND is_active = true
			ORDER BY id ASC
		`, id)
	} else {
		rows, err = h.gpsRepo.Pool().Query(ctx, `
			SELECT id, shift_name, 
			       COALESCE(start_time::text, ''), 
			       COALESCE(end_time::text, ''), 
			       COALESCE(time_duration, 0),
			       report_type_id
			FROM shifts 
			ORDER BY id ASC
		`)
	}

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query shifts: " + err.Error()})
		return
	}
	defer rows.Close()

	shifts := []map[string]interface{}{}
	for rows.Next() {
		var id, duration, reportTypeID int
		var name, startTime, endTime string
		if err := rows.Scan(&id, &name, &startTime, &endTime, &duration, &reportTypeID); err == nil {
			shifts = append(shifts, map[string]interface{}{
				"id":             id,
				"shift_name":     name,
				"name":           name,
				"start_time":     startTime,
				"end_time":       endTime,
				"time_duration":  duration,
				"report_type_id": reportTypeID,
			})
		}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success":     true,
		"status_code": 200,
		"data":        shifts,
	})
}

func (h *Handler) CreateShift(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var req struct {
		ShiftName    string `json:"shift_name"`
		StartTime    string `json:"start_time"` // "HH:MM:SS"
		EndTime      string `json:"end_time"`   // "HH:MM:SS"
		TimeDuration int    `json:"time_duration"`
		ReportTypeID int    `json:"report_type_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON body"})
		return
	}

	if req.ReportTypeID == 0 {
		req.ReportTypeID = 1 // Default to VEHICLE_MOVEMENT
	}

	var shiftID int
	err := h.gpsRepo.Pool().QueryRow(ctx, `
		INSERT INTO shifts (shift_name, start_time, end_time, time_duration, report_type_id)
		VALUES ($1, $2::time, $3::time, $4, $5)
		RETURNING id
	`, req.ShiftName, req.StartTime, req.EndTime, req.TimeDuration, req.ReportTypeID).Scan(&shiftID)

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create shift: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"id":      shiftID,
	})
}

func (h *Handler) GetReportTypes(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	rows, err := h.gpsRepo.Pool().Query(ctx, "SELECT id, name, COALESCE(description, '') FROM report_types ORDER BY id ASC")
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query report types: " + err.Error()})
		return
	}
	defer rows.Close()

	types := []map[string]interface{}{}
	for rows.Next() {
		var id int
		var name, desc string
		if err := rows.Scan(&id, &name, &desc); err == nil {
			types = append(types, map[string]interface{}{
				"id":          id,
				"name":        name,
				"description": desc,
			})
		}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    types,
	})
}

func (h *Handler) DeleteShift(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	idStr := chi.URLParam(r, "id")
	shiftID, err := strconv.Atoi(idStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid shift ID"})
		return
	}

	_, err = h.gpsRepo.Pool().Exec(ctx, "DELETE FROM shifts WHERE id = $1", shiftID)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete shift: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
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
			rw.ward_id, 
			r.shift_id, 
			COALESCE(r.lanes, '[]'::jsonb) as lanes, 
			COALESCE(r.is_active, true),
			COALESCE(r.created_at, NOW()),
			COALESCE(w.region_name, ''),
			COALESCE(s.shift_name, ''),
			COALESCE(g.polygon::text, ''),
			COALESCE(g.color, ''),
			COALESCE(rt.name, 'D2D')
		FROM routes r
		LEFT JOIN LATERAL (SELECT ward_id FROM route_wards WHERE route_id = r.id LIMIT 1) rw ON true
		LEFT JOIN regions w ON rw.ward_id = w.id
		LEFT JOIN shifts s ON r.shift_id = s.id
		LEFT JOIN geofences g ON r.geometry_id = g.id
		LEFT JOIN route_types_vswm rt ON r.route_type_id = rt.id
		ORDER BY r.id DESC
	`

	rows, err := h.gpsRepo.Pool().Query(ctx, query)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query routes: " + err.Error()})
		return
	}
	defer rows.Close()

	routes := []RouteResponse{}
	for rows.Next() {
		var r RouteResponse
		var lanes []byte
		if err := rows.Scan(
			&r.ID, &r.RouteName, &r.Identification, &r.Distance, &r.RouteTypeID,
			&r.GeometryID, &r.WardID, &r.ShiftID, &lanes, &r.IsActive, &r.UpdatedAt,
			&r.WardName, &r.ShiftName, &r.GeoJSON, &r.Color, &r.RouteTypeName,
		); err == nil {
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

func (h *Handler) GetRouteByID(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	idStr := chi.URLParam(r, "id")
	routeID, err := strconv.Atoi(idStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid route ID"})
		return
	}

	query := `
		SELECT 
			r.id, 
			COALESCE(r.route_name, ''), 
			COALESCE(r.identification, ''), 
			COALESCE(r.distance, 0.0), 
			COALESCE(r.route_type_id, 1), 
			r.geometry_id, 
			rw.ward_id, 
			r.shift_id, 
			COALESCE(r.lanes, '[]'::jsonb) as lanes, 
			COALESCE(r.is_active, true),
			COALESCE(r.created_at, NOW()),
			COALESCE(w.region_name, ''),
			COALESCE(s.shift_name, ''),
			COALESCE(g.polygon::text, ''),
			COALESCE(g.color, ''),
			COALESCE(rt.name, 'D2D')
		FROM routes r
		LEFT JOIN LATERAL (SELECT ward_id FROM route_wards WHERE route_id = r.id LIMIT 1) rw ON true
		LEFT JOIN regions w ON rw.ward_id = w.id
		LEFT JOIN shifts s ON r.shift_id = s.id
		LEFT JOIN geofences g ON r.geometry_id = g.id
		LEFT JOIN route_types_vswm rt ON r.route_type_id = rt.id
		WHERE r.id = $1
	`

	var route RouteResponse
	var lanes []byte
	var updatedAt time.Time
	var color string
	err = h.gpsRepo.Pool().QueryRow(ctx, query, routeID).Scan(
		&route.ID, &route.RouteName, &route.Identification, &route.Distance, &route.RouteTypeID,
		&route.GeometryID, &route.WardID, &route.ShiftID, &lanes, &route.IsActive, &updatedAt,
		&route.WardName, &route.ShiftName, &route.GeoJSON, &color, &route.RouteTypeName,
	)
	if err != nil {
		sendJSON(w, http.StatusNotFound, map[string]string{"error": "Route not found: " + err.Error()})
		return
	}
	route.Color = color
	route.UpdatedAt = updatedAt

	if len(lanes) > 0 {
		route.Lanes = json.RawMessage(lanes)
	} else {
		route.Lanes = json.RawMessage("[]")
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    route,
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
		INSERT INTO routes (route_name, identification, distance, route_type_id, geometry_id, shift_id, lanes, is_active)
		VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, true)
		RETURNING id
	`, req.RouteName, req.Identification, req.Distance, req.RouteTypeID, geometryID, req.ShiftID, lanesJSON).Scan(&routeID)

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create route: " + err.Error()})
		return
	}

	// Insert into route_wards if WardID is provided
	if req.WardID != nil {
		_, _ = h.gpsRepo.Pool().Exec(ctx, `
			INSERT INTO route_wards (route_id, ward_id) VALUES ($1, $2)
		`, routeID, *req.WardID)
	}

	// Sync lanes to route_checkpoints
	if len(req.Lanes) > 0 {
		syncRouteCheckpoints(ctx, h, routeID, req.RouteName, req.Lanes)
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
		    route_type_id = $4, geometry_id = $5, 
		    shift_id = $6, lanes = $7::jsonb
		WHERE id = $8
	`, req.RouteName, req.Identification, req.Distance, req.RouteTypeID, geometryID, req.ShiftID, lanesJSON, routeID)

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update route: " + err.Error()})
		return
	}

	// 4. Update route_wards
	_, _ = h.gpsRepo.Pool().Exec(ctx, "DELETE FROM route_wards WHERE route_id = $1", routeID)
	if req.WardID != nil {
		_, _ = h.gpsRepo.Pool().Exec(ctx, `
			INSERT INTO route_wards (route_id, ward_id) VALUES ($1, $2)
		`, routeID, *req.WardID)
	}

	// Sync lanes to route_checkpoints
	if len(req.Lanes) > 0 {
		syncRouteCheckpoints(ctx, h, routeID, req.RouteName, req.Lanes)
	} else {
		// Clear checkpoints if lanes are empty
		h.gpsRepo.Pool().Exec(ctx, "DELETE FROM route_checkpoints WHERE route_id = $1", routeID)
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

// Helper to automatically convert Lanes into Checkpoints for coverage calculations
func syncRouteCheckpoints(ctx context.Context, h *Handler, routeID int, routeName string, lanesJSON []byte) {
	type Point struct {
		X float64 `json:"x"`
		Y float64 `json:"y"`
	}
	type Lane struct {
		LaneOrder        int     `json:"lane_order"`
		StartPoint       Point   `json:"start_point"`
		EndPoint         Point   `json:"end_point"`
		// Fallbacks for old database format
		OldLaneOrder     int     `json:"laneOrder"`
		OldStartLat      float64 `json:"startLat"`
		OldStartLng      float64 `json:"startLng"`
		OldEndLat        float64 `json:"endLat"`
		OldEndLng        float64 `json:"endLng"`
	}

	var lanes []Lane
	if err := json.Unmarshal(lanesJSON, &lanes); err != nil {
		fmt.Println("syncRouteCheckpoints json.Unmarshal error:", err)
		return
	}
	fmt.Printf("syncRouteCheckpoints: parsed %d lanes for route %d\n", len(lanes), routeID)

	db := h.gpsRepo.Pool()

	// 1. Clear old checkpoints for this route
	_, err := db.Exec(ctx, "DELETE FROM route_checkpoints WHERE route_id = $1", routeID)
	if err != nil {
		fmt.Println("syncRouteCheckpoints DELETE error:", err)
	}

	// 2. Insert new checkpoints
	// For each lane, we insert the start point and the end point
	seq := 1
	for _, lane := range lanes {
		laneOrder := lane.LaneOrder
		if laneOrder == 0 {
			laneOrder = lane.OldLaneOrder
		}

		startLat := lane.StartPoint.Y
		startLng := lane.StartPoint.X
		if startLat == 0 && startLng == 0 {
			startLat = lane.OldStartLat
			startLng = lane.OldStartLng
		}

		endLat := lane.EndPoint.Y
		endLng := lane.EndPoint.X
		if endLat == 0 && endLng == 0 {
			endLat = lane.OldEndLat
			endLng = lane.OldEndLng
		}

		fmt.Printf("syncRouteCheckpoints: inserting Start checkpoint for lane %d\n", laneOrder)
		// Start Point
		_, err = db.Exec(ctx, `
			INSERT INTO route_checkpoints (route_id, checkpoint_name, latitude, longitude, radius_meters, sequence_order)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, routeID, routeName+"_Lane"+strconv.Itoa(laneOrder)+"_Start", startLat, startLng, 10.0, seq)
		if err != nil {
			fmt.Println("syncRouteCheckpoints INSERT start error:", err)
		}
		seq++

		// End Point
		// Check if end is significantly different from start to avoid duplicate pins
		if startLat != endLat || startLng != endLng {
			fmt.Printf("syncRouteCheckpoints: inserting End checkpoint for lane %d\n", laneOrder)
			_, err = db.Exec(ctx, `
				INSERT INTO route_checkpoints (route_id, checkpoint_name, latitude, longitude, radius_meters, sequence_order)
				VALUES ($1, $2, $3, $4, $5, $6)
			`, routeID, routeName+"_Lane"+strconv.Itoa(laneOrder)+"_End", endLat, endLng, 10.0, seq)
			if err != nil {
				fmt.Println("syncRouteCheckpoints INSERT end error:", err)
			}
			seq++
		}
	}
	fmt.Println("syncRouteCheckpoints: done syncing")
}
