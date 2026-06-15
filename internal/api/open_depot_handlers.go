package api

import (
	"encoding/json"
	"gps-tracking-system/internal/repository"
	"gps-tracking-system/internal/utils"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
)

func (h *Handler) GetOpenDepots(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	
	// Parse optional shift_id and date
	q := r.URL.Query()
	var shiftID int
	var opDate time.Time
	var err error
	
	if sIDStr := q.Get("shift_id"); sIDStr != "" {
		shiftID, err = strconv.Atoi(sIDStr)
		if err != nil {
			sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid shift_id"})
			return
		}
	}
	
	if dateStr := q.Get("date"); dateStr != "" {
		opDate, err = time.Parse("2006-01-02", dateStr)
		if err != nil {
			sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid date format, use YYYY-MM-DD"})
			return
		}
	}
	
	// If shiftID or opDate are not specified, dynamically compute them using India timezone
	if shiftID == 0 || opDate.IsZero() {
		now := utils.CurrentTimeInIndia()
		resolvedShiftID, resolvedOpDate, err := h.openDepotRepo.GetShiftAndOperationalDate(ctx, now)
		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to resolve active shift: " + err.Error()})
			return
		}
		if shiftID == 0 {
			shiftID = resolvedShiftID
		}
		if opDate.IsZero() {
			opDate = resolvedOpDate
		}
	}
	
	depots, err := h.openDepotRepo.GetAll(ctx, shiftID, opDate)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch open depots: " + err.Error()})
		return
	}
	
	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success":  true,
		"shift_id": shiftID,
		"date":     opDate.Format("2006-01-02"),
		"data":     depots,
	})
}

func (h *Handler) GetOpenDepotByID(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid open depot ID"})
		return
	}

	depot, err := h.openDepotRepo.GetByID(ctx, id)
	if err != nil {
		sendJSON(w, http.StatusNotFound, map[string]string{"error": "Open depot not found: " + err.Error()})
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    depot,
	})
}

func (h *Handler) CreateOpenDepot(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var req struct {
		Name      string  `json:"name"`
		ZoneID    int     `json:"zone_id"`
		WardID    int     `json:"ward_id"`
		Latitude  float64 `json:"latitude"`
		Longitude float64 `json:"longitude"`
		Radius    float64 `json:"radius"`
		Status    string  `json:"status"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	// Validation
	if req.Name == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Open depot name is required"})
		return
	}
	if req.ZoneID == 0 {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Zone selection is required"})
		return
	}
	if req.WardID == 0 {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Ward selection is required"})
		return
	}
	if req.Latitude == 0.0 {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Latitude is required"})
		return
	}
	if req.Longitude == 0.0 {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Longitude is required"})
		return
	}
	if req.Radius <= 0 {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Radius must be greater than 0"})
		return
	}

	depot := &repository.OpenDepot{
		Name:      req.Name,
		ZoneID:    req.ZoneID,
		WardID:    req.WardID,
		Latitude:  req.Latitude,
		Longitude: req.Longitude,
		Radius:    req.Radius,
		Status:    req.Status,
	}

	if err := h.openDepotRepo.Create(ctx, depot); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create open depot: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"message": "Open depot created successfully",
		"data":    depot,
	})
}

func (h *Handler) UpdateOpenDepot(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid open depot ID"})
		return
	}

	var req struct {
		Name      string  `json:"name"`
		ZoneID    int     `json:"zone_id"`
		WardID    int     `json:"ward_id"`
		Latitude  float64 `json:"latitude"`
		Longitude float64 `json:"longitude"`
		Radius    float64 `json:"radius"`
		Status    string  `json:"status"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	// Validation
	if req.Name == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Open depot name is required"})
		return
	}
	if req.ZoneID == 0 {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Zone selection is required"})
		return
	}
	if req.WardID == 0 {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Ward selection is required"})
		return
	}
	if req.Latitude == 0.0 {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Latitude is required"})
		return
	}
	if req.Longitude == 0.0 {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Longitude is required"})
		return
	}
	if req.Radius <= 0 {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Radius must be greater than 0"})
		return
	}

	depot, err := h.openDepotRepo.GetByID(ctx, id)
	if err != nil {
		sendJSON(w, http.StatusNotFound, map[string]string{"error": "Open depot not found"})
		return
	}

	depot.Name = req.Name
	depot.ZoneID = req.ZoneID
	depot.WardID = req.WardID
	depot.Latitude = req.Latitude
	depot.Longitude = req.Longitude
	depot.Radius = req.Radius
	depot.Status = req.Status

	if err := h.openDepotRepo.Update(ctx, depot); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update open depot: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Open depot updated successfully",
		"data":    depot,
	})
}

func (h *Handler) DeleteOpenDepot(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid open depot ID"})
		return
	}

	if err := h.openDepotRepo.Delete(ctx, id); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete open depot: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Open depot deleted successfully",
	})
}

func (h *Handler) GetOpenDepotAnalytics(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	analytics, err := h.openDepotRepo.GetAnalytics(ctx)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to calculate analytics: " + err.Error()})
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    analytics,
	})
}
