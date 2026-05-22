package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"gps-tracking-system/internal/repository"

	"github.com/go-chi/chi/v5"
)

// AddRouteCheckpoint adds a new checkpoint (lane pointer) to a route
func (h *Handler) AddRouteCheckpoint(w http.ResponseWriter, r *http.Request) {
	routeIDStr := chi.URLParam(r, "id")
	routeID, err := strconv.Atoi(routeIDStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid route ID"})
		return
	}

	var cp repository.RouteCheckpoint
	if err := json.NewDecoder(r.Body).Decode(&cp); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}
	cp.RouteID = routeID

	if err := h.routeRepo.AddCheckpoint(r.Context(), &cp); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to add checkpoint: " + err.Error()})
		return
	}

	h.routeEngine.RefreshCache()

	sendJSON(w, http.StatusCreated, map[string]interface{}{"success": true, "data": cp})
}

// GetRouteCheckpoints returns all checkpoints for a route
func (h *Handler) GetRouteCheckpoints(w http.ResponseWriter, r *http.Request) {
	routeIDStr := chi.URLParam(r, "id")
	routeID, err := strconv.Atoi(routeIDStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid route ID"})
		return
	}

	cps, err := h.routeRepo.GetCheckpointsByRoute(r.Context(), routeID)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to get checkpoints: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": cps})
}

// AssignRouteToVehicle assigns a vehicle to a route for the day
func (h *Handler) AssignRouteToVehicle(w http.ResponseWriter, r *http.Request) {
	vehicleIDStr := chi.URLParam(r, "id")
	vehicleID, err := strconv.Atoi(vehicleIDStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid vehicle ID"})
		return
	}

	var payload struct {
		RouteID int    `json:"route_id"`
		Date    string `json:"date"` // YYYY-MM-DD
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}

	var targetDate time.Time
	if payload.Date == "" {
		targetDate = time.Now()
	} else {
		parsedDate, err := time.Parse("2006-01-02", payload.Date)
		if err != nil {
			sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid date format, use YYYY-MM-DD"})
			return
		}
		targetDate = parsedDate
	}

	if err := h.routeRepo.AssignRoute(r.Context(), vehicleID, payload.RouteID, targetDate); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to assign route: " + err.Error()})
		return
	}

	h.routeEngine.RefreshCache()

	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

// GetVehicleRouteCoverage gets the coverage % for a vehicle on a given date
func (h *Handler) GetVehicleRouteCoverage(w http.ResponseWriter, r *http.Request) {
	vehicleIDStr := chi.URLParam(r, "id")
	vehicleID, err := strconv.Atoi(vehicleIDStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid vehicle ID"})
		return
	}

	dateStr := r.URL.Query().Get("date")
	var targetDate time.Time
	if dateStr == "" {
		targetDate = time.Now()
	} else {
		parsedDate, err := time.Parse("2006-01-02", dateStr)
		if err != nil {
			sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid date format, use YYYY-MM-DD"})
			return
		}
		targetDate = parsedDate
	}

	assignment, err := h.routeRepo.GetAssignedRoute(r.Context(), vehicleID, targetDate)
	if err != nil || assignment == nil {
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"success": false,
			"error": "No route assigned to this vehicle for the given date",
		})
		return
	}

	checkpoints, err := h.routeRepo.GetCheckpointsByRoute(r.Context(), assignment.RouteID)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to load checkpoints"})
		return
	}

	totalCheckpoints := len(checkpoints)
	if totalCheckpoints == 0 {
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"route_id": assignment.RouteID,
			"total_checkpoints": 0,
			"visited_checkpoints": 0,
			"coverage_percentage": 0,
		})
		return
	}

	visitedIDs, err := h.routeRepo.GetVisitedCheckpoints(r.Context(), vehicleID, assignment.RouteID, targetDate)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to load coverage"})
		return
	}
	
	// Count unique hits
	visitedMap := make(map[int]bool)
	for _, vid := range visitedIDs {
		visitedMap[vid] = true
	}
	
	visitedCount := 0
	var visitedDetails []map[string]interface{}
	
	for _, cp := range checkpoints {
		hit := visitedMap[cp.ID]
		if hit {
			visitedCount++
		}
		visitedDetails = append(visitedDetails, map[string]interface{}{
			"checkpoint_id": cp.ID,
			"name": cp.CheckpointName,
			"visited": hit,
		})
	}

	coveragePct := float64(visitedCount) / float64(totalCheckpoints) * 100.0

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"route_id": assignment.RouteID,
		"total_checkpoints": totalCheckpoints,
		"visited_checkpoints": visitedCount,
		"coverage_percentage": coveragePct,
		"details": visitedDetails,
	})
}
