package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"gps-tracking-system/internal/repository"

	"github.com/go-chi/chi/v5"
)

// GetVehiclePurposes returns all vehicle collection types from the DB.
func (h *Handler) GetVehiclePurposes(w http.ResponseWriter, r *http.Request) {
	list, err := h.vRepo.GetAllVehiclePurposes(r.Context())
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch vehicle purposes: " + err.Error()})
		return
	}
	if list == nil {
		list = []repository.VehiclePurpose{}
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "status_code": 200, "data": list})
}

// CreateVehiclePurpose creates a new vehicle collection type.
func (h *Handler) CreateVehiclePurpose(w http.ResponseWriter, r *http.Request) {
	var vp repository.VehiclePurpose
	if err := json.NewDecoder(r.Body).Decode(&vp); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}
	if vp.Name == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Collection type name is required"})
		return
	}
	if err := h.vRepo.CreateVehiclePurpose(r.Context(), &vp); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create vehicle purpose: " + err.Error()})
		return
	}
	sendJSON(w, http.StatusCreated, map[string]interface{}{"success": true, "data": vp})
}

// UpdateVehiclePurpose renames a vehicle collection type.
func (h *Handler) UpdateVehiclePurpose(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
		return
	}
	if err := h.vRepo.UpdateVehiclePurpose(r.Context(), id, body.Name); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update: " + err.Error()})
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

// DeleteVehiclePurpose removes a vehicle collection type.
func (h *Handler) DeleteVehiclePurpose(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}
	if err := h.vRepo.DeleteVehiclePurpose(r.Context(), id); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete: " + err.Error()})
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}
