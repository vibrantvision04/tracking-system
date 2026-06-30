package api

import (
	"encoding/json"
	"gps-tracking-system/internal/repository"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

func (h *Handler) GetEmployeeVehicleAssignments(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	items, err := h.empVehicleRepo.GetAll(ctx)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch assignments: " + err.Error()})
		return
	}
	if items == nil {
		items = []repository.EmployeeVehicleAssignmentDetail{}
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    items,
	})
}

func (h *Handler) AssignEmployeeVehicle(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req struct {
		EmployeeID int `json:"employee_id"`
		VehicleID  int `json:"vehicle_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}
	if req.EmployeeID == 0 || req.VehicleID == 0 {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "employee_id and vehicle_id are required"})
		return
	}

	assignment, err := h.empVehicleRepo.Assign(ctx, req.EmployeeID, req.VehicleID)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to assign employee to vehicle: " + err.Error()})
		return
	}

	// Rebuild the vehicle cache to reflect the new assignment
	h.RebuildCache()

	sendJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"data":    assignment,
	})
}

func (h *Handler) RemoveEmployeeVehicleAssignment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	if err := h.empVehicleRepo.RemoveByID(ctx, id); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to remove assignment: " + err.Error()})
		return
	}

	h.RebuildCache()

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}
