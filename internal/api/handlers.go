package api

import (
	"encoding/json"
	"fmt"
	"gps-tracking-system/internal/repository"
	"gps-tracking-system/internal/service"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/redis/go-redis/v9"
)

type Handler struct {
	vRepo    *repository.VehicleRepository
	gpsRepo  *repository.GPSRepository
	rService *service.ReportService
	rdb      *redis.Client
}

func NewHandler(vRepo *repository.VehicleRepository, gpsRepo *repository.GPSRepository, rService *service.ReportService, rdb *redis.Client) *Handler {
	return &Handler{
		vRepo:    vRepo,
		gpsRepo:  gpsRepo,
		rService: rService,
		rdb:      rdb,
	}
}

func (h *Handler) publishMetadataUpdate(ctx context.Context, entity string, id interface{}) {
	payload := map[string]interface{}{
		"type":   "metadata_update",
		"entity": entity,
		"id":     id,
	}
	jsonData, _ := json.Marshal(payload)
	h.rdb.Publish(ctx, "metadata:updates", jsonData)
}

// Helper to send JSON responses
func sendJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(payload)
}

func (h *Handler) GetVehicles(w http.ResponseWriter, r *http.Request) {
	vehicles, err := h.vRepo.GetAll(r.Context())
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": vehicles})
}

func (h *Handler) GetVehicleByIMEI(w http.ResponseWriter, r *http.Request) {
	imei := chi.URLParam(r, "imei")
	vehicle, err := h.vRepo.GetByIMEI(r.Context(), imei)
	if err != nil {
		sendJSON(w, http.StatusNotFound, map[string]string{"error": "Vehicle not found"})
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": vehicle})
}

func (h *Handler) GetReports(w http.ResponseWriter, r *http.Request) {
	dateStr := r.URL.Query().Get("date")
	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		date = time.Now()
	}

	reports, err := h.rService.GetReports(r.Context(), 0, date, date) // 0 means all vehicles
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": reports})
}

func (h *Handler) CreateVehicle(w http.ResponseWriter, r *http.Request) {
	var v repository.Vehicle
	if err := json.NewDecoder(r.Body).Decode(&v); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}
	
	if err := h.vRepo.CreateVehicle(r.Context(), &v); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save vehicle: " + err.Error()})
		return
	}

	h.publishMetadataUpdate(r.Context(), "vehicle", v.ID)
	sendJSON(w, http.StatusCreated, map[string]interface{}{"success": true, "data": v})
}

func (h *Handler) GetDevices(w http.ResponseWriter, r *http.Request) {
	devices, err := h.vRepo.GetDevices(r.Context())
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": devices})
}

func (h *Handler) CreateDevice(w http.ResponseWriter, r *http.Request) {
	var d repository.GpsDevice
	if err := json.NewDecoder(r.Body).Decode(&d); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}
	
	if err := h.vRepo.CreateDevice(r.Context(), &d); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save device: " + err.Error()})
		return
	}

	h.publishMetadataUpdate(r.Context(), "device", d.ID)
	sendJSON(w, http.StatusCreated, map[string]interface{}{"success": true, "data": d})
}

func (h *Handler) MapDevice(w http.ResponseWriter, r *http.Request) {
	var m struct {
		GpsDeviceID int `json:"gps_device_id"`
		VehicleID   int `json:"vehicle_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&m); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}
	
	if err := h.vRepo.MapDevice(r.Context(), m.VehicleID, m.GpsDeviceID); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to map device: " + err.Error()})
		return
	}

	h.publishMetadataUpdate(r.Context(), "mapping", m.VehicleID)
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *Handler) GetGpsData(w http.ResponseWriter, r *http.Request) {
	imei := chi.URLParam(r, "imei")
	fromStr := r.URL.Query().Get("from")
	toStr := r.URL.Query().Get("to")
	
	from, err := time.Parse(time.RFC3339, fromStr)
	if err != nil {
		from = time.Now().Add(-24 * time.Hour)
	}
	to, err := time.Parse(time.RFC3339, toStr)
	if err != nil {
		to = time.Now()
	}

	// 1. Get vehicle ID from IMEI
	vehicle, err := h.vRepo.GetByIMEI(r.Context(), imei)
	if err != nil {
		sendJSON(w, http.StatusNotFound, map[string]string{"error": "Vehicle/IMEI mapping not found"})
		return
	}

	// 2. Fetch historical points from gps_repo using vehicle ID
	data, err := h.gpsRepo.GetByVehicle(r.Context(), vehicle.ID, from, to)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch GPS data: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true, 
		"data":    data, 
		"imei":    imei, 
		"count":   len(data),
	})
}

func (h *Handler) GetVehicleTypes(w http.ResponseWriter, r *http.Request) {
	types, err := h.vRepo.GetTypes(r.Context())
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": types})
}

func (h *Handler) CreateVehicleType(w http.ResponseWriter, r *http.Request) {
	sendJSON(w, http.StatusCreated, map[string]interface{}{"success": true})
}

func (h *Handler) GetAlerts(w http.ResponseWriter, r *http.Request) {
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": []interface{}{}})
}

func (h *Handler) UpdateDeviceStatus(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		ID       int  `json:"id"`
		IsActive bool `json:"is_active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}
	
	if err := h.vRepo.UpdateDeviceStatus(r.Context(), payload.ID, payload.IsActive); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update device: " + err.Error()})
		return
	}
	
	h.publishMetadataUpdate(r.Context(), "device", payload.ID)
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *Handler) UnmapDevice(w http.ResponseWriter, r *http.Request) {
	deviceIDStr := chi.URLParam(r, "id")
	var deviceID int
	fmt.Sscanf(deviceIDStr, "%d", &deviceID)
	
	if err := h.vRepo.UnmapDevice(r.Context(), deviceID); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to unmap device: " + err.Error()})
		return
	}
	h.publishMetadataUpdate(r.Context(), "mapping", deviceID)
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *Handler) DeleteVehicle(w http.ResponseWriter, r *http.Request) {
	vehicleIDStr := chi.URLParam(r, "id")
	var vehicleID int
	fmt.Sscanf(vehicleIDStr, "%d", &vehicleID)

	if err := h.vRepo.DeleteVehicle(r.Context(), vehicleID); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete vehicle: " + err.Error()})
		return
	}
	h.publishMetadataUpdate(r.Context(), "vehicle", vehicleID)
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *Handler) DeleteDevice(w http.ResponseWriter, r *http.Request) {
	deviceIDStr := chi.URLParam(r, "id")
	var deviceID int
	fmt.Sscanf(deviceIDStr, "%d", &deviceID)

	if err := h.vRepo.DeleteDevice(r.Context(), deviceID); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete device: " + err.Error()})
		return
	}
	h.publishMetadataUpdate(r.Context(), "device", deviceID)
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}
