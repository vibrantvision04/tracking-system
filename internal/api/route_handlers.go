package api

import (
	"context"
	"encoding/json"
	"gps-tracking-system/internal/repository"
	"gps-tracking-system/internal/utils"
	"net/http"
	"strconv"
	"time"

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
		ShiftID int    `json:"shift_id"`
		Date    string `json:"date"` // YYYY-MM-DD
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}

	var targetDate time.Time
	if payload.Date == "" {
		targetDate = utils.CurrentTimeInIndia()
	} else {
		parsedDate, err := time.ParseInLocation("2006-01-02", payload.Date, utils.IndianLocation)
		if err != nil {
			sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid date format, use YYYY-MM-DD"})
			return
		}
		targetDate = parsedDate
	}

	if payload.ShiftID <= 0 {
		var route struct {
			ShiftID *int
		}
		err := h.gpsRepo.Pool().QueryRow(r.Context(), "SELECT shift_id FROM routes WHERE id = $1", payload.RouteID).Scan(&route.ShiftID)
		if err == nil && route.ShiftID != nil {
			payload.ShiftID = *route.ShiftID
		} else {
			payload.ShiftID = 1 // default shift ID
		}
	}

	if err := h.routeRepo.AssignRoute(r.Context(), vehicleID, payload.RouteID, payload.ShiftID, targetDate); err != nil {
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
		targetDate = utils.CurrentTimeInIndia()
	} else {
		parsedDate, err := time.ParseInLocation("2006-01-02", dateStr, utils.IndianLocation)
		if err != nil {
			sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid date format, use YYYY-MM-DD"})
			return
		}
		targetDate = parsedDate
	}

	routeIDStr := r.URL.Query().Get("route_id")
	var routeID int
	if routeIDStr != "" {
		var err error
		routeID, err = strconv.Atoi(routeIDStr)
		if err != nil {
			sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid route ID"})
			return
		}
	} else {
		var shiftIDPtr *int
		if shiftIDStr := r.URL.Query().Get("shift_id"); shiftIDStr != "" {
			if sID, err := strconv.Atoi(shiftIDStr); err == nil {
				shiftIDPtr = &sID
			}
		}
		assignment, err := h.routeRepo.GetAssignedRoute(r.Context(), vehicleID, targetDate, shiftIDPtr, nil)
		if err != nil || assignment == nil {
			sendJSON(w, http.StatusOK, map[string]interface{}{
				"success": false,
				"error":   "No route assigned to this vehicle for the given date",
			})
			return
		}
		routeID = assignment.RouteID
	}

	checkpoints, err := h.routeRepo.GetCheckpointsByRoute(r.Context(), routeID)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to load checkpoints"})
		return
	}

	totalCheckpoints := len(checkpoints)
	if totalCheckpoints == 0 {
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"success":             true,
			"route_id":            routeID,
			"total_checkpoints":   0,
			"visited_checkpoints": 0,
			"coverage_percentage": 0,
		})
		return
	}

	// Trigger sequential and speed-limit validation calculation retroactively for this date if no history exists or force_recalc is true
	targetDateStr := targetDate.Format("2006-01-02")
	isToday := (targetDateStr == utils.CurrentTimeInIndia().Format("2006-01-02"))
	hasHistory, _ := h.routeRepo.HasCoverageRecords(r.Context(), vehicleID, routeID, targetDateStr)
	forceRecalc := r.URL.Query().Get("force_recalc") == "true"
	localForceRecalc := forceRecalc || isToday

	if localForceRecalc || !hasHistory {
		mu := getRecalcMutex(vehicleID, routeID, targetDateStr)
		mu.Lock()

		// Re-check hasHistory under the lock to avoid redundant calculation
		var err error
		if !localForceRecalc {
			hasHistory, err = h.routeRepo.HasCoverageRecords(r.Context(), vehicleID, routeID, targetDateStr)
		}

		if localForceRecalc || err != nil || !hasHistory {
			recalculateCoverage(context.Background(), h.gpsRepo, h.routeRepo, vehicleID, routeID, targetDateStr, h.routeEngine.RequireSequentialCheckpoints, h.routeEngine.MaxCheckpointSpeedKmh)
		}
		mu.Unlock()
	}

	visitedIDs, err := h.routeRepo.GetVisitedCheckpoints(r.Context(), vehicleID, routeID, targetDate)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to load coverage"})
		return
	}
	
	// Fetch miss reasons from database
	missMap := make(map[int]string)
	missRows, err := h.gpsRepo.Pool().Query(r.Context(), `
		SELECT checkpoint_id, reason 
		FROM route_coverage_miss_reasons 
		WHERE vehicle_id = $1 AND route_id = $2 AND report_date = $3
	`, vehicleID, routeID, targetDate.Format("2006-01-02"))
	if err == nil {
		defer missRows.Close()
		for missRows.Next() {
			var cpID int
			var reason string
			if err := missRows.Scan(&cpID, &reason); err == nil {
				missMap[cpID] = reason
			}
		}
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
		
		reason := ""
		if !hit {
			reason = missMap[cp.ID]
			if reason == "" {
				reason = "Never Reached"
			}
		}
		
		visitedDetails = append(visitedDetails, map[string]interface{}{
			"checkpoint_id": cp.ID,
			"name":          cp.CheckpointName,
			"visited":       hit,
			"reason":        reason,
		})
	}

	coveragePct := float64(visitedCount) / float64(totalCheckpoints) * 100.0

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success":             true,
		"route_id":            routeID,
		"total_checkpoints":   totalCheckpoints,
		"visited_checkpoints": visitedCount,
		"coverage_percentage": coveragePct,
		"details":             visitedDetails,
	})
}

func (h *Handler) GetVehicleRouteAssignments(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	dateStr := r.URL.Query().Get("date")

	var assignments []repository.VehicleRouteAssignmentDetail
	var err error

	if dateStr == "all" || dateStr == "" {
		assignments, err = h.routeRepo.GetAllVehicleRouteAssignments(ctx)
	} else {
		var targetDate time.Time
		targetDate, err = time.ParseInLocation("2006-01-02", dateStr, utils.IndianLocation)
		if err != nil {
			sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid date format, use YYYY-MM-DD"})
			return
		}
		assignments, err = h.routeRepo.GetVehicleRouteAssignmentsByDate(ctx, targetDate)
	}

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch assignments: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    assignments,
	})
}

func (h *Handler) DeleteVehicleRouteAssignment(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid assignment ID"})
		return
	}

	if err := h.routeRepo.DeleteAssignment(r.Context(), id); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete assignment: " + err.Error()})
		return
	}

	h.routeEngine.RefreshCache()

	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}
