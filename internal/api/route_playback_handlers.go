package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"gps-tracking-system/internal/repository"
	"gps-tracking-system/internal/service"
	"github.com/go-chi/chi/v5"
)

type PlaybackGeometryResponse struct {
	RouteID                     int                          `json:"route_id"`
	RouteName                   string                       `json:"route_name"`
	IsSequential                bool                         `json:"is_sequential"`
	GeoJSON                     string                       `json:"geojson"`
	Color                       string                       `json:"color"`
	Checkpoints                 []repository.RouteCheckpoint `json:"checkpoints"`
	LanePoints                  []repository.RouteLanePoint  `json:"lane_points"`
	AggressiveSnapping          bool                         `json:"aggressive_snapping"`
	AiReconstructionEnabled     bool                         `json:"ai_reconstruction_enabled"`
	AiCoverageRecoveryEnabled   bool                         `json:"ai_coverage_recovery_enabled"`
	AiPlaybackCorrectionEnabled bool                         `json:"ai_playback_correction_enabled"`
	GpsQualityMode              string                       `json:"gps_quality_mode"`
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
			COALESCE(g.polygon::text, ''),
			COALESCE(g.color, ''),
			COALESCE(r.aggressive_snapping, false),
			COALESCE(r.ai_reconstruction_enabled, false),
			COALESCE(r.ai_coverage_recovery_enabled, false),
			COALESCE(r.ai_playback_correction_enabled, false),
			COALESCE(r.gps_quality_mode, 'normal')
		FROM routes r
		LEFT JOIN geofences g ON r.geometry_id = g.id
		WHERE r.id = $1
	`

	var resp PlaybackGeometryResponse
	err = h.gpsRepo.Pool().QueryRow(ctx, query, routeID).Scan(
		&resp.RouteID,
		&resp.RouteName,
		&resp.IsSequential,
		&resp.GeoJSON,
		&resp.Color,
		&resp.AggressiveSnapping,
		&resp.AiReconstructionEnabled,
		&resp.AiCoverageRecoveryEnabled,
		&resp.AiPlaybackCorrectionEnabled,
		&resp.GpsQualityMode,
	)
	if err != nil {
		sendJSON(w, http.StatusNotFound, map[string]string{"error": "Route not found or database query failed"})
		return
	}

	// 2. Get route checkpoints
	cps, err := h.routeRepo.GetCheckpointsByRoute(ctx, routeID)
	if err != nil {
		resp.Checkpoints = []repository.RouteCheckpoint{}
	} else {
		resp.Checkpoints = cps
	}

	// 3. Get route lane points
	lps, err := h.routeRepo.GetLanePointsByRoute(ctx, routeID)
	if err != nil {
		resp.LanePoints = []repository.RouteLanePoint{}
	} else {
		resp.LanePoints = lps
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    resp,
	})
}

func (h *Handler) GetVehicleReconstruction(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	idStr := chi.URLParam(r, "id")
	vehicleID, err := strconv.Atoi(idStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid vehicle ID"})
		return
	}

	dateStr := r.URL.Query().Get("date")
	if dateStr == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Date query parameter is required (YYYY-MM-DD)"})
		return
	}

	routeIDStr := r.URL.Query().Get("route_id")
	if routeIDStr == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "route_id query parameter is required"})
		return
	}
	routeID, err := strconv.Atoi(routeIDStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid route ID"})
		return
	}

	// 1. Try to fetch existing reconstruction from DB first
	existing, err := h.routeRepo.GetRouteReconstruction(ctx, vehicleID, routeID, dateStr)
	if err == nil && existing != nil {
		var path []service.ReconstructedPoint
		_ = json.Unmarshal([]byte(existing.ReconstructedPath), &path)
		
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"data": map[string]interface{}{
				"vehicle_id":         existing.VehicleID,
				"route_id":           existing.RouteID,
				"report_date":        existing.ReportDate.Format("2006-01-02"),
				"raw_gps_count":      existing.RawGpsCount,
				"corrected_gps_count": existing.CorrectedGpsCount,
				"average_confidence":  existing.AverageConfidence,
				"reconstructed_path":  path,
				"cached":             true,
			},
		})
		return
	}

	// 2. Fetch raw GPS points
	fromTime, err := time.Parse("2006-01-02T15:04:05Z", dateStr+"T00:00:00Z")
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid date format"})
		return
	}
	toTime := fromTime.Add(24 * time.Hour)

	rawPoints, err := h.gpsRepo.GetByVehicle(ctx, vehicleID, fromTime, toTime)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch GPS data: " + err.Error()})
		return
	}

	// Convert rawPoints to service.GPSPoint slice
	gpsPoints := make([]service.GPSPoint, len(rawPoints))
	for i, rp := range rawPoints {
		ignVal := rp.Ignition
		gpsPoints[i] = service.GPSPoint{
			Lat:      rp.Lat,
			Lng:      rp.Lng,
			Time:     rp.Time,
			Speed:    rp.Speed,
			Ignition: &ignVal,
		}
	}

	// 3. Trigger Reconstruction
	reconstructed, avgConfidence, err := h.aiReconService.ReconstructRoute(ctx, routeID, gpsPoints)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Route reconstruction failed: " + err.Error()})
		return
	}

	pathBytes, _ := json.Marshal(reconstructed)

	// Save to DB
	vr := &repository.VehicleRouteReconstruction{
		VehicleID:          vehicleID,
		RouteID:            routeID,
		ReportDate:         fromTime,
		RawGpsCount:        len(gpsPoints),
		CorrectedGpsCount:  len(reconstructed),
		AverageConfidence:  avgConfidence,
		ReconstructedPath:  string(pathBytes),
	}
	_ = h.routeRepo.SaveRouteReconstruction(ctx, vr)

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"vehicle_id":         vehicleID,
			"route_id":           routeID,
			"report_date":        dateStr,
			"raw_gps_count":      len(gpsPoints),
			"corrected_gps_count": len(reconstructed),
			"average_confidence":  avgConfidence,
			"reconstructed_path":  reconstructed,
			"cached":             false,
		},
	})
}
