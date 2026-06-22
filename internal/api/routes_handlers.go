package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"gps-tracking-system/internal/repository"

	"github.com/go-chi/chi/v5"
)

type RouteResponse struct {
	ID                 int             `json:"id"`
	RouteName          string          `json:"route_name"`
	Identification     string          `json:"identification"`
	Distance           float64         `json:"distance"`
	RouteTypeID        int             `json:"route_type_id"`
	RouteTypeName      string          `json:"route_type_name"`
	GeometryID         *int            `json:"geometry_id,omitempty"`
	WardID             *int            `json:"ward_id,omitempty"`
	WardName           string          `json:"ward_name"`
	ShiftID            *int            `json:"shift_id,omitempty"`
	ShiftName          string          `json:"shift_name"`
	Lanes              json.RawMessage `json:"lanes"`
	IsActive           bool            `json:"is_active"`
	GeoJSON            string          `json:"geojson"`
	Color              string          `json:"color"`
	UpdatedAt          time.Time       `json:"updated_at"`
	IsSequential       bool            `json:"is_sequential"`
	CorridorMeters     float64         `json:"corridor_meters"`
	RouteDirection     string          `json:"route_direction"`
	SeqLookahead                int             `json:"seq_lookahead"`
	AggressiveSnapping          bool            `json:"aggressive_snapping"`
	AiReconstructionEnabled     bool            `json:"ai_reconstruction_enabled"`
	AiCoverageRecoveryEnabled   bool            `json:"ai_coverage_recovery_enabled"`
	AiPlaybackCorrectionEnabled bool            `json:"ai_playback_correction_enabled"`
	GpsQualityMode              string          `json:"gps_quality_mode"`
}

type CreateRouteRequest struct {
	RouteName          string          `json:"route_name"`
	Identification     string          `json:"identification"`
	Distance           float64         `json:"distance"`
	RouteTypeID        int             `json:"route_type_id"`
	WardID             *int            `json:"ward_id"`
	ShiftID            *int            `json:"shift_id"`
	GeoJSON            string          `json:"geojson"`
	Color              string          `json:"color"`
	Lanes          json.RawMessage `json:"lanes"`
	IsSequential       *bool           `json:"is_sequential"`
	CorridorMeters     *float64        `json:"corridor_meters"`
	RouteDirection     string          `json:"route_direction"`
	SeqLookahead                *int            `json:"seq_lookahead"`
	AggressiveSnapping          *bool           `json:"aggressive_snapping"`
	AiReconstructionEnabled     *bool           `json:"ai_reconstruction_enabled"`
	AiCoverageRecoveryEnabled   *bool           `json:"ai_coverage_recovery_enabled"`
	AiPlaybackCorrectionEnabled *bool           `json:"ai_playback_correction_enabled"`
	GpsQualityMode              string          `json:"gps_quality_mode"`
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
	vehicleIDStr := r.URL.Query().Get("vehicle_id")
	wardIDStr := r.URL.Query().Get("ward_id")
	zoneIDStr := r.URL.Query().Get("zone_id")

	var args []interface{}
	argCount := 1

	baseQuery := `SELECT DISTINCT s.id, s.shift_name, 
	                     COALESCE(s.start_time::text, ''), 
	                     COALESCE(s.end_time::text, ''), 
	                     COALESCE(s.time_duration, 0),
	                     s.report_type_id
	              FROM shifts s`
	
	joins := ""
	whereClauses := []string{"s.is_active = true"}

	if group != "" {
		joins += " JOIN report_types rt ON s.report_type_id = rt.id"
		whereClauses = append(whereClauses, fmt.Sprintf("rt.name = $%d", argCount))
		args = append(args, group)
		argCount++
	} else if reportTypeIDStr != "" {
		id, _ := strconv.Atoi(reportTypeIDStr)
		whereClauses = append(whereClauses, fmt.Sprintf("s.report_type_id = $%d", argCount))
		args = append(args, id)
		argCount++
	}

	if vehicleIDStr != "" {
		vID, _ := strconv.Atoi(vehicleIDStr)
		joins += " JOIN vehicle_route_assignments vra ON vra.shift_id = s.id"
		whereClauses = append(whereClauses, fmt.Sprintf("vra.vehicle_id = $%d", argCount))
		args = append(args, vID)
		argCount++
	}

	if wardIDStr != "" {
		wardID, _ := strconv.Atoi(wardIDStr)
		joins += " JOIN routes r_w ON r_w.shift_id = s.id JOIN route_wards rw ON rw.route_id = r_w.id"
		whereClauses = append(whereClauses, fmt.Sprintf("rw.ward_id = $%d", argCount))
		args = append(args, wardID)
		argCount++
	} else if zoneIDStr != "" {
		zoneID, _ := strconv.Atoi(zoneIDStr)
		joins += " JOIN routes r_z ON r_z.shift_id = s.id JOIN route_wards rw_z ON rw_z.route_id = r_z.id JOIN regions w_z ON rw_z.ward_id = w_z.id"
		whereClauses = append(whereClauses, fmt.Sprintf("w_z.parent_id = $%d", argCount))
		args = append(args, zoneID)
		argCount++
	}

	query := baseQuery + joins
	if len(whereClauses) > 0 {
		query += " WHERE " + strings.Join(whereClauses, " AND ")
	}
	query += " ORDER BY s.id ASC"

	rows, err := h.gpsRepo.Pool().Query(ctx, query, args...)
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
			COALESCE(rt.name, 'D2D'),
			COALESCE(r.is_sequential, false),
			COALESCE(r.corridor_meters, 50.0),
			COALESCE(r.route_direction, 'both'),
			COALESCE(r.seq_lookahead, 5),
			COALESCE(r.aggressive_snapping, false),
			COALESCE(r.ai_reconstruction_enabled, false),
			COALESCE(r.ai_coverage_recovery_enabled, false),
			COALESCE(r.ai_playback_correction_enabled, false),
			COALESCE(r.gps_quality_mode, 'normal')
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
			&r.IsSequential, &r.CorridorMeters, &r.RouteDirection, &r.SeqLookahead, &r.AggressiveSnapping,
			&r.AiReconstructionEnabled, &r.AiCoverageRecoveryEnabled, &r.AiPlaybackCorrectionEnabled, &r.GpsQualityMode,
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
			COALESCE(rt.name, 'D2D'),
			COALESCE(r.is_sequential, false),
			COALESCE(r.corridor_meters, 50.0),
			COALESCE(r.route_direction, 'both'),
			COALESCE(r.seq_lookahead, 5),
			COALESCE(r.aggressive_snapping, false),
			COALESCE(r.ai_reconstruction_enabled, false),
			COALESCE(r.ai_coverage_recovery_enabled, false),
			COALESCE(r.ai_playback_correction_enabled, false),
			COALESCE(r.gps_quality_mode, 'normal')
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
		&route.IsSequential, &route.CorridorMeters, &route.RouteDirection, &route.SeqLookahead, &route.AggressiveSnapping,
		&route.AiReconstructionEnabled, &route.AiCoverageRecoveryEnabled, &route.AiPlaybackCorrectionEnabled, &route.GpsQualityMode,
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

	isSeq := false
	if req.IsSequential != nil {
		isSeq = *req.IsSequential
	}
	corridor := 50.0
	if req.CorridorMeters != nil {
		corridor = *req.CorridorMeters
	}
	routeDir := "both"
	if req.RouteDirection != "" {
		routeDir = req.RouteDirection
	}
	lookahead := 5
	if req.SeqLookahead != nil {
		lookahead = *req.SeqLookahead
	}
	aggSnap := false
	if req.AggressiveSnapping != nil {
		aggSnap = *req.AggressiveSnapping
	}
	aiRecon := false
	if req.AiReconstructionEnabled != nil {
		aiRecon = *req.AiReconstructionEnabled
	}
	aiCov := false
	if req.AiCoverageRecoveryEnabled != nil {
		aiCov = *req.AiCoverageRecoveryEnabled
	}
	aiPlay := false
	if req.AiPlaybackCorrectionEnabled != nil {
		aiPlay = *req.AiPlaybackCorrectionEnabled
	}
	gpsQuality := "normal"
	if req.GpsQualityMode != "" {
		gpsQuality = req.GpsQualityMode
	}

	var routeID int
	err := h.gpsRepo.Pool().QueryRow(ctx, `
		INSERT INTO routes (route_name, identification, distance, route_type_id, geometry_id, shift_id, lanes, is_active, is_sequential, corridor_meters, route_direction, seq_lookahead, aggressive_snapping, ai_reconstruction_enabled, ai_coverage_recovery_enabled, ai_playback_correction_enabled, gps_quality_mode)
		VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, true, $8, $9, $10, $11, $12, $13, $14, $15, $16)
		RETURNING id
	`, req.RouteName, req.Identification, req.Distance, req.RouteTypeID, geometryID, req.ShiftID, lanesJSON, isSeq, corridor, routeDir, lookahead, aggSnap, aiRecon, aiCov, aiPlay, gpsQuality).Scan(&routeID)

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

	// Sync checkpoints and lane points (from Lanes or GeoJSON)
	syncRouteCheckpointsAndLanePoints(ctx, h, routeID, req.RouteName, req.Lanes, req.GeoJSON)

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

	isSeq := false
	if req.IsSequential != nil {
		isSeq = *req.IsSequential
	}
	corridor := 50.0
	if req.CorridorMeters != nil {
		corridor = *req.CorridorMeters
	}
	routeDir := "both"
	if req.RouteDirection != "" {
		routeDir = req.RouteDirection
	}
	lookahead := 5
	if req.SeqLookahead != nil {
		lookahead = *req.SeqLookahead
	}
	aggSnap := false
	if req.AggressiveSnapping != nil {
		aggSnap = *req.AggressiveSnapping
	}
	aiRecon := false
	if req.AiReconstructionEnabled != nil {
		aiRecon = *req.AiReconstructionEnabled
	}
	aiCov := false
	if req.AiCoverageRecoveryEnabled != nil {
		aiCov = *req.AiCoverageRecoveryEnabled
	}
	aiPlay := false
	if req.AiPlaybackCorrectionEnabled != nil {
		aiPlay = *req.AiPlaybackCorrectionEnabled
	}
	gpsQuality := "normal"
	if req.GpsQualityMode != "" {
		gpsQuality = req.GpsQualityMode
	}

	// 3. Update route details
	_, err = h.gpsRepo.Pool().Exec(ctx, `
		UPDATE routes 
		SET route_name = $1, identification = $2, distance = $3, 
		    route_type_id = $4, geometry_id = $5, 
		    shift_id = $6, lanes = $7::jsonb,
		    is_sequential = $9, corridor_meters = $10, route_direction = $11, seq_lookahead = $12,
		    aggressive_snapping = $13,
		    ai_reconstruction_enabled = $14,
		    ai_coverage_recovery_enabled = $15,
		    ai_playback_correction_enabled = $16,
		    gps_quality_mode = $17
		WHERE id = $8
	`, req.RouteName, req.Identification, req.Distance, req.RouteTypeID, geometryID, req.ShiftID, lanesJSON, routeID, isSeq, corridor, routeDir, lookahead, aggSnap, aiRecon, aiCov, aiPlay, gpsQuality)

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

	// Sync checkpoints and lane points (from Lanes or GeoJSON)
	syncRouteCheckpointsAndLanePoints(ctx, h, routeID, req.RouteName, req.Lanes, req.GeoJSON)

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
type GeoJSONGeometry struct {
	Type        string        `json:"type"`
	Coordinates [][]float64   `json:"coordinates"`
}

type GeoJSONFeature struct {
	Type     string          `json:"type"`
	Geometry GeoJSONGeometry `json:"geometry"`
}

func parseCoordinatesFromGeoJSON(geojsonStr string) [][]float64 {
	if geojsonStr == "" {
		return nil
	}

	// Try parsing as Feature
	var feature GeoJSONFeature
	if err := json.Unmarshal([]byte(geojsonStr), &feature); err == nil && feature.Geometry.Type == "LineString" {
		return feature.Geometry.Coordinates
	}

	// Try parsing as raw Geometry LineString
	var geom GeoJSONGeometry
	if err := json.Unmarshal([]byte(geojsonStr), &geom); err == nil && geom.Type == "LineString" {
		return geom.Coordinates
	}

	return nil
}

// Helper to automatically convert Lanes or GeoJSON into Checkpoints and Lane Points for coverage calculations
func syncRouteCheckpointsAndLanePoints(ctx context.Context, h *Handler, routeID int, routeName string, lanesJSON []byte, geojsonStr string) {
	db := h.gpsRepo.Pool()

	// 1. Clear old checkpoints and lane points
	_, err := db.Exec(ctx, "DELETE FROM route_checkpoints WHERE route_id = $1", routeID)
	if err != nil {
		fmt.Println("syncRouteCheckpointsAndLanePoints route_checkpoints DELETE error:", err)
	}
	_, err = db.Exec(ctx, "DELETE FROM route_lane_points WHERE route_id = $1", routeID)
	if err != nil {
		fmt.Println("syncRouteCheckpointsAndLanePoints route_lane_points DELETE error:", err)
	}

	type TempPoint struct {
		Name string
		Lat  float64
		Lng  float64
	}
	var points []TempPoint

	// 2. Try to get points from Lanes
	var hasLanes bool
	if len(lanesJSON) > 0 && string(lanesJSON) != "[]" && string(lanesJSON) != "null" {
		type Point struct {
			X float64 `json:"x"`
			Y float64 `json:"y"`
		}
		type Lane struct {
			LaneOrder        int     `json:"lane_order"`
			StartPoint       Point   `json:"start_point"`
			EndPoint         Point   `json:"end_point"`
			OldLaneOrder     int     `json:"laneOrder"`
			OldStartLat      float64 `json:"startLat"`
			OldStartLng      float64 `json:"startLng"`
			OldEndLat        float64 `json:"endLat"`
			OldEndLng        float64 `json:"endLng"`
		}

		var lanes []Lane
		if err := json.Unmarshal(lanesJSON, &lanes); err == nil && len(lanes) > 0 {
			hasLanes = true
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

				points = append(points, TempPoint{
					Name: routeName + "_Lane" + strconv.Itoa(laneOrder) + "_Start",
					Lat:  startLat,
					Lng:  startLng,
				})

				if startLat != endLat || startLng != endLng {
					points = append(points, TempPoint{
						Name: routeName + "_Lane" + strconv.Itoa(laneOrder) + "_End",
						Lat:  endLat,
						Lng:  endLng,
					})
				}
			}
		}
	}

	// 3. Fallback to GeoJSON coordinates if no lanes
	if !hasLanes && geojsonStr != "" {
		coords := parseCoordinatesFromGeoJSON(geojsonStr)
		for idx, c := range coords {
			if len(c) >= 2 {
				points = append(points, TempPoint{
					Name: routeName + "_Point" + strconv.Itoa(idx+1),
					Lat:  c[1],
					Lng:  c[0],
				})
			}
		}
	}

	if len(points) == 0 {
		fmt.Printf("syncRouteCheckpointsAndLanePoints: no points to insert for route %d\n", routeID)
		return
	}

	fmt.Printf("syncRouteCheckpointsAndLanePoints: inserting %d points for route %d\n", len(points), routeID)

	// 4. Insert into route_checkpoints and route_lane_points
	for i, pt := range points {
		seq := i + 1
		
		// Insert into route_checkpoints (for legacy support)
		_, err = db.Exec(ctx, `
			INSERT INTO route_checkpoints (route_id, checkpoint_name, latitude, longitude, radius_meters, sequence_order)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, routeID, pt.Name, pt.Lat, pt.Lng, 10.0, seq)
		if err != nil {
			fmt.Println("syncRouteCheckpointsAndLanePoints route_checkpoints INSERT error:", err)
		}

		// Insert into route_lane_points (the core table)
		_, err = db.Exec(ctx, `
			INSERT INTO route_lane_points (route_id, sequence_number, latitude, longitude)
			VALUES ($1, $2, $3, $4)
		`, routeID, seq, pt.Lat, pt.Lng)
		if err != nil {
			fmt.Println("syncRouteCheckpointsAndLanePoints route_lane_points INSERT error:", err)
		}
	}
	fmt.Println("syncRouteCheckpointsAndLanePoints: done syncing")
}
