package api

import (
	"math"
	"net/http"
	"strconv"
	"time"

	"gps-tracking-system/internal/utils"

	"github.com/go-chi/chi/v5"
)

// GetRouteLanePoints returns all lane points for a route ordered by sequence_number ascending
func (h *Handler) GetRouteLanePoints(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	idStr := chi.URLParam(r, "id")
	routeID, err := strconv.Atoi(idStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid route ID"})
		return
	}

	// Verify route exists
	var exists bool
	err = h.gpsRepo.Pool().QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM routes WHERE id = $1)", routeID).Scan(&exists)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to check route existence: " + err.Error()})
		return
	}
	if !exists {
		sendJSON(w, http.StatusNotFound, map[string]string{"error": "Route not found"})
		return
	}

	// Fetch lane points
	points, err := h.routeRepo.GetLanePointsByRoute(ctx, routeID)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch route lane points: " + err.Error()})
		return
	}

	type lpItem struct {
		ID             int     `json:"id"`
		RouteID        int     `json:"route_id"`
		SequenceNumber int     `json:"sequence_number"`
		Latitude       float64 `json:"latitude"`
		Longitude      float64 `json:"longitude"`
		Status         string  `json:"status"`
		Color          string  `json:"color"`
	}

	items := make([]lpItem, len(points))
	for i, p := range points {
		items[i] = lpItem{
			ID:             p.ID,
			RouteID:        p.RouteID,
			SequenceNumber: p.SequenceNumber,
			Latitude:       p.Latitude,
			Longitude:      p.Longitude,
			Status:         "pending",
			Color:          "gray",
		}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"route_id":    routeID,
			"lane_points": items,
		},
	})
}

// GetVehicleLanePointCoverage retrieves sequential lane point coverage for a vehicle
func (h *Handler) GetVehicleLanePointCoverage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vehicleIDStr := chi.URLParam(r, "id")
	vehicleID, err := strconv.Atoi(vehicleIDStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid vehicle ID"})
		return
	}

	dateStr := r.URL.Query().Get("date")
	if dateStr == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Date parameter is required"})
		return
	}
	targetDate, err := time.ParseInLocation("2006-01-02", dateStr, utils.IndianLocation)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid date format, use YYYY-MM-DD"})
		return
	}

	routeIDStr := r.URL.Query().Get("route_id")
	var routeID int
	if routeIDStr != "" {
		routeID, err = strconv.Atoi(routeIDStr)
		if err != nil {
			sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid route ID"})
			return
		}
	} else {
		// Resolve assignment for the date
		assignment, err := h.routeRepo.GetAssignedRoute(ctx, vehicleID, targetDate, nil, nil)
		if err != nil || assignment == nil {
			sendJSON(w, http.StatusOK, map[string]interface{}{
				"success": false,
				"error":   "No route assigned to this vehicle for the given date",
			})
			return
		}
		routeID = assignment.RouteID
	}

	// Fetch lane points to check total count
	lanePoints, err := h.routeRepo.GetLanePointsByRoute(ctx, routeID)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to get route lane points: " + err.Error()})
		return
	}

	totalLanePoints := len(lanePoints)
	if totalLanePoints == 0 {
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"success":             true,
			"route_id":            routeID,
			"date":                dateStr,
			"total_lane_points":   0,
			"total_checkpoints":   0,
			"achieved_count":      0,
			"missed_count":        0,
			"pending_count":       0,
			"coverage_percentage": 0.0,
			"is_complete":         false,
			"violation_occurred":  false,
			"completed_at":        nil,
			"details":             []interface{}{},
		})
		return
	}

	// Recalculation logic trigger
	isToday := (dateStr == utils.CurrentTimeInIndia().Format("2006-01-02"))
	forceRecalc := r.URL.Query().Get("force_recalc") == "true"
	localForceRecalc := forceRecalc || isToday

	var hasHistory bool
	err = h.gpsRepo.Pool().QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM vehicle_lane_point_logs
			WHERE vehicle_id = $1 AND route_id = $2 AND report_date = $3
		)
	`, vehicleID, routeID, dateStr).Scan(&hasHistory)
	if err != nil {
		hasHistory = false
	}

	if localForceRecalc || !hasHistory {
		proximityMeters := 10.0
		err = RecalculateLanePointCoverage(ctx, h.gpsRepo, h.routeRepo, vehicleID, routeID, dateStr, proximityMeters)
		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to recalculate lane point coverage: " + err.Error()})
			return
		}
	}

	// Fetch logs
	logs, err := h.routeRepo.GetVehicleLanePointLogs(ctx, vehicleID, routeID, dateStr)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch vehicle lane point logs: " + err.Error()})
		return
	}

	// Compute metrics
	var achieved, missed, pending int
	var violationOccurred bool
	var completedAt *time.Time

	type detailItem struct {
		LanePointID    int        `json:"lane_point_id"`
		SequenceNumber int        `json:"sequence_number"`
		Status         string     `json:"status"`
		Color          string     `json:"color"`
		HitTime        *time.Time `json:"hit_time"`
	}

	details := make([]detailItem, len(logs))
	for i, l := range logs {
		var color string
		switch l.Status {
		case "achieved":
			achieved++
			color = "green"
		case "missed":
			missed++
			color = "red"
		default:
			pending++
			color = "gray"
		}

		if l.ViolationOccurred {
			violationOccurred = true
		}
		if l.CompletedAt != nil {
			completedAt = l.CompletedAt
		}

		// Find corresponding sequence number
		seqNo := i + 1
		for _, lp := range lanePoints {
			if lp.ID == l.LanePointID {
				seqNo = lp.SequenceNumber
				break
			}
		}

		details[i] = detailItem{
			LanePointID:    l.LanePointID,
			SequenceNumber: seqNo,
			Status:         l.Status,
			Color:          color,
			HitTime:        l.HitTime,
		}
	}

	// If logs are empty, default pending count to total points
	if len(logs) == 0 {
		pending = totalLanePoints
	}

	coveragePct := 0.0
	if totalLanePoints > 0 {
		coveragePct = math.Round((float64(achieved)/float64(totalLanePoints)*100)*100) / 100
	}

	isComplete := (achieved == totalLanePoints) && !violationOccurred

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success":             true,
		"route_id":            routeID,
		"date":                dateStr,
		"total_lane_points":   totalLanePoints,
		"total_checkpoints":   totalLanePoints, // alias for backward-compat
		"achieved_count":      achieved,
		"missed_count":        missed,
		"pending_count":       pending,
		"coverage_percentage": coveragePct,
		"is_complete":         isComplete,
		"violation_occurred":  violationOccurred,
		"completed_at":        completedAt,
		"details":             details,
	})
}
