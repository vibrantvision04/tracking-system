package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

func (h *Handler) GetRouteWards(w http.ResponseWriter, r *http.Request) {
	list, err := h.routeRepo.GetRouteWards(r.Context())
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch route-wards: " + err.Error()})
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": list})
}

func (h *Handler) CreateRouteWard(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RouteID int `json:"route_id"`
		WardID  int `json:"ward_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}
	if body.RouteID == 0 || body.WardID == 0 {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "route_id and ward_id are required"})
		return
	}
	if err := h.routeRepo.CreateRouteWard(r.Context(), body.RouteID, body.WardID); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to assign route to ward: " + err.Error()})
		return
	}
	sendJSON(w, http.StatusCreated, map[string]interface{}{"success": true})
}

func (h *Handler) DeleteRouteWard(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}
	if err := h.routeRepo.DeleteRouteWard(r.Context(), id); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete: " + err.Error()})
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}
