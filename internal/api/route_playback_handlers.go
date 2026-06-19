package api

import (
	"net/http"
	"strconv"

	"gps-tracking-system/internal/repository"
	"github.com/go-chi/chi/v5"
)

type PlaybackGeometryResponse struct {
	RouteID        int                          `json:"route_id"`
	RouteName      string                       `json:"route_name"`
	IsSequential   bool                         `json:"is_sequential"`
	CorridorMeters float64                      `json:"corridor_meters"`
	RouteDirection string                       `json:"route_direction"`
	SeqLookahead   int                          `json:"seq_lookahead"`
	GeoJSON        string                       `json:"geojson"`
	Color          string                       `json:"color"`
	Checkpoints    []repository.RouteCheckpoint `json:"checkpoints"`
}

func (h *Handler) GetRoutePlaybackGeometry(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	idStr := chi.URLParam(r, "id")
	routeID, err := strconv.Atoi(idStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid route ID"})
		return
	}

	// 1. Get route details and geojson
	query := `
		SELECT 
			r.id, 
			COALESCE(r.route_name, ''),
			COALESCE(r.is_sequential, false),
			COALESCE(r.corridor_meters, 50.0),
			COALESCE(r.route_direction, 'both'),
			COALESCE(r.seq_lookahead, 5),
			COALESCE(g.polygon::text, ''),
			COALESCE(g.color, '')
		FROM routes r
		LEFT JOIN geofences g ON r.geometry_id = g.id
		WHERE r.id = $1
	`

	var resp PlaybackGeometryResponse
	err = h.gpsRepo.Pool().QueryRow(ctx, query, routeID).Scan(
		&resp.RouteID,
		&resp.RouteName,
		&resp.IsSequential,
		&resp.CorridorMeters,
		&resp.RouteDirection,
		&resp.SeqLookahead,
		&resp.GeoJSON,
		&resp.Color,
	)
	if err != nil {
		sendJSON(w, http.StatusNotFound, map[string]string{"error": "Route not found or database query failed"})
		return
	}

	// 2. Get route checkpoints
	cps, err := h.routeRepo.GetCheckpointsByRoute(ctx, routeID)
	if err != nil {
		// Fallback to empty array
		resp.Checkpoints = []repository.RouteCheckpoint{}
	} else {
		resp.Checkpoints = cps
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    resp,
	})
}
