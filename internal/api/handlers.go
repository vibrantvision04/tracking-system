package api

import (
	"context"
	"encoding/json"
	"fmt"
	"gps-tracking-system/internal/decoder"
	"gps-tracking-system/internal/repository"
	"gps-tracking-system/internal/service"
	"hash/crc32"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/redis/go-redis/v9"
)

type ResolvedDetails struct {
	Reason         string `json:"reason"`
	SnoozeDuration int    `json:"snooze_duration"`
}

type Handler struct {
	vRepo             *repository.VehicleRepository
	gpsRepo           *repository.GPSRepository
	rService          *service.ReportService
	rdb               *redis.Client
	routeRepo         *repository.RouteRepository
	routeEngine       *service.RouteEngine
	zoneVehiclesCache map[string][]map[string]interface{}
	cacheMutex        sync.RWMutex
	alertsMutex       sync.Mutex
	alertsCache       []map[string]interface{}
	resolvedAlerts    map[int]ResolvedDetails
}

func NewHandler(vRepo *repository.VehicleRepository, gpsRepo *repository.GPSRepository, rService *service.ReportService, rdb *redis.Client, routeRepo *repository.RouteRepository, routeEngine *service.RouteEngine) *Handler {
	h := &Handler{
		vRepo:             vRepo,
		gpsRepo:           gpsRepo,
		rService:          rService,
		rdb:               rdb,
		routeRepo:         routeRepo,
		routeEngine:       routeEngine,
		zoneVehiclesCache: make(map[string][]map[string]interface{}),
		resolvedAlerts:    make(map[int]ResolvedDetails),
	}
	h.RebuildCache()
	h.LoadAlerts()
	// Refresh vehicle cache every 30 seconds so GPS positions and statuses stay live
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			h.RebuildCache()
		}
	}()
	return h
}

func (h *Handler) RebuildCache() {
	ctx := context.Background()
	vehicles, err := h.vRepo.GetAll(ctx)
	if err != nil {
		fmt.Printf("Failed to fetch vehicles for cache: %v\n", err)
		return
	}

	newCache := make(map[string][]map[string]interface{})
	var allVehicles []map[string]interface{}

	for _, v := range vehicles {
		m := map[string]interface{}{
			"id":              v.ID,
			"registration_no": v.RegistrationNo,
			"chassis_no":      v.ChassisNo,
			"is_owned":        v.IsOwned,
			"vehicle_type_id": v.VehicleTypeID,
			"is_active":       v.IsActive,
			"vehicle_type":    v.VehicleType,
			"gps_device":      v.GpsDevice,
			"status":          v.Status,
			"last_lat":        v.LastLat,
			"last_lng":        v.LastLng,
			"last_time":       v.LastTime,
		}
		
		
		allVehicles = append(allVehicles, m)
	}

	newCache["all"] = allVehicles

	h.cacheMutex.Lock()
	h.zoneVehiclesCache = newCache
	h.cacheMutex.Unlock()

	fmt.Printf("Rebuilt vehicle cache: %d zones cached\n", len(newCache))
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
	zoneIDStr := r.URL.Query().Get("zone_id")
	if zoneIDStr == "" {
		zoneIDStr = "all"
	}

	h.cacheMutex.RLock()
	vehicles, ok := h.zoneVehiclesCache[zoneIDStr]
	h.cacheMutex.RUnlock()

	if !ok {
		sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": []map[string]interface{}{}})
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
	vehicleIDStr := r.URL.Query().Get("vehicle_id")
	fromStr := r.URL.Query().Get("from")
	toStr := r.URL.Query().Get("to")
	pageStr := r.URL.Query().Get("page")
	limitStr := r.URL.Query().Get("limit")

	vehicleID, _ := strconv.Atoi(vehicleIDStr)
	page, _ := strconv.Atoi(pageStr)
	limit, _ := strconv.Atoi(limitStr)
	if page < 1 { page = 1 }
	if limit < 1 { limit = 10 }
	offset := (page - 1) * limit

	from, err := time.Parse("2006-01-02", fromStr)
	if err != nil {
		from = time.Now().AddDate(0, 0, -7)
	}
	to, err := time.Parse("2006-01-02", toStr)
	if err != nil {
		to = time.Now()
	}

	// Trigger real-time report generation/caching asynchronously in the background.
	// This immediately loads the pre-computed reports from DB and prevents the HTTP request from blocking/timing out.
	if vehicleID > 0 {
		go func(vID int, startD, endD time.Time) {
			// Create a background context for report generation
			ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
			defer cancel()

			vehicle, err := h.vRepo.GetByID(ctx, vID)
			if err == nil {
				zone := ""
				ward := ""
				if vehicle.VehicleType != nil {
					ward = vehicle.VehicleType.Name
				}

				curr := startD
				daysCount := 0
				// Limit to a maximum of 31 days to protect the background worker
				for !curr.After(endD) && daysCount < 31 {
					_ = h.rService.GenerateDailyReport(ctx, vID, curr, zone, ward)
					curr = curr.AddDate(0, 0, 1)
					daysCount++
				}
			}
		}(vehicleID, from, to)
	}

	reports, total, err := h.rService.GetReports(r.Context(), vehicleID, from, to, limit, offset)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	totalPages := (total + limit - 1) / limit
	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success":     true,
		"data":        reports,
		"total":       total,
		"page":        page,
		"limit":       limit,
		"total_pages": totalPages,
	})
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

func (h *Handler) UpdateVehicle(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}
	var v repository.Vehicle
	if err := json.NewDecoder(r.Body).Decode(&v); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}
	v.ID = id
	
	if err := h.vRepo.UpdateVehicle(r.Context(), &v); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update vehicle: " + err.Error()})
		return
	}

	h.publishMetadataUpdate(r.Context(), "vehicle", v.ID)
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": v})
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
	var vt repository.VehicleType
	if err := json.NewDecoder(r.Body).Decode(&vt); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}
	
	if err := h.vRepo.CreateType(r.Context(), &vt); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save type: " + err.Error()})
		return
	}

	h.publishMetadataUpdate(r.Context(), "type", vt.ID)
	sendJSON(w, http.StatusCreated, map[string]interface{}{"success": true, "data": vt})
}

// StoppageAlert structs match the frontend expectation
type StoppageAlert struct {
	ID                 int                    `json:"id"`
	AlertTypeID        int                    `json:"alert_type_id"`
	TimeReported       time.Time              `json:"time_reported"`
	LogTime            time.Time              `json:"log_time"`
	ZoneID             int                    `json:"zone_id"`
	WardID             int                    `json:"ward_id"`
	RouteID            int                    `json:"route_id"`
	VehicleID          int                    `json:"vehicle_id"`
	IMEI               string                 `json:"imei"`
	Status             string                 `json:"status"`
	AlertParameterJSON AlertParameter         `json:"alert_parameter_json"`
	AlertPoint         AlertPoint             `json:"alert_point"`
	Vehicle            AlertVehicle           `json:"vehicle"`
	WardName           string                 `json:"ward_name"`
	RouteName          string                 `json:"route_name"`
	ParkingAt          string                 `json:"parking_at,omitempty"`
	AlertType          AlertTypeDetails       `json:"alert_type"`
	AlertCount         int                    `json:"alert_count"`
	Reason             string                 `json:"reason"`
	SnoozeDuration     int                    `json:"snooze_duration"`
}

type AlertParameter struct {
	Unit      string `json:"unit"`
	LimitTime int    `json:"limit_time"`
	Duration  int    `json:"duration"`
}

type AlertPoint struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type AlertVehicle struct {
	ID             int    `json:"id"`
	RegistrationNo string `json:"registration_no"`
	VehicleTypeID  int    `json:"vehicle_type_id"`
	IMEI           string `json:"imei"`
	IsActive       bool   `json:"is_active"`
}

type AlertTypeDetails struct {
	ID             int    `json:"id"`
	AlertTypeName  string `json:"alert_type_name"`
	Slug           string `json:"slug"`
}

func (h *Handler) LoadAlerts() {
	fmt.Println("Dynamic DB Alerts active: LoadAlerts is no-op")
}

func haversine(lat1, lon1, lat2, lon2 float64) float64 {
	const r = 6371.0 // Earth radius in km
	dLat := (lat2 - lat1) * math.Pi / 180.0
	dLon := (lon2 - lon1) * math.Pi / 180.0
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180.0)*math.Cos(lat2*math.Pi/180.0)*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return r * c
}

func (h *Handler) GetAlerts(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Direct paged query from pre-computed SQL alerts table
	query := `
		SELECT id, alert_type, imei, vehicle_id, registration_no, COALESCE(ward_no, ''), COALESCE(driver, ''), COALESCE(alert_detail, ''), time_reported, status, snooze_duration, COALESCE(reason, ''), lat, lng
		FROM alerts
		WHERE status = 'pending'
		ORDER BY time_reported DESC
		LIMIT 100
	`
	rows, err := h.gpsRepo.Pool().Query(ctx, query)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch alerts: " + err.Error()})
		return
	}
	defer rows.Close()

	var alerts []StoppageAlert

	for rows.Next() {
		var a StoppageAlert
		var reason, detail, driver, imei string
		var lat, lng float64
		err := rows.Scan(
			&a.ID, &a.AlertType.AlertTypeName, &imei, &a.VehicleID, &a.Vehicle.RegistrationNo,
			&a.WardName, &driver, &detail, &a.TimeReported, &a.Status,
			&a.SnoozeDuration, &reason, &lat, &lng,
		)
		if err != nil {
			continue
		}

		a.IMEI = imei
		a.LogTime = a.TimeReported
		a.Reason = reason
		a.AlertPoint.X = lng
		a.AlertPoint.Y = lat
		a.Vehicle.ID = a.VehicleID
		a.Vehicle.IMEI = imei
		a.Vehicle.IsActive = true
		a.Vehicle.VehicleTypeID = 1

		// Parse duration dynamically if available
		var dur float64
		if _, err := fmt.Sscanf(detail, "Stoppage of more than 5:00 Min(s) (Duration: %f Min)", &dur); err == nil {
			a.AlertParameterJSON.Duration = int(dur)
		} else {
			a.AlertParameterJSON.Duration = 10
		}
		a.AlertParameterJSON.Unit = "minutes"
		a.AlertParameterJSON.LimitTime = 10

		// Map type IDs to match frontend requirements
		a.AlertTypeID = 5
		a.AlertType.ID = 5
		a.AlertType.Slug = "stoppage"
		if a.AlertType.AlertTypeName == "Over Speeding" {
			a.AlertTypeID = 6
			a.AlertType.ID = 6
			a.AlertType.Slug = "overspeeding"
		}

		alerts = append(alerts, a)
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    alerts,
	})
}

func (h *Handler) ResolveAlert(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	alertID, err := strconv.Atoi(idStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid alert ID"})
		return
	}
	var payload struct {
		Reason         string `json:"reason"`
		SnoozeDuration int    `json:"snooze_duration"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload: " + err.Error()})
		return
	}

	// 1. Update in-memory fallback cache
	h.alertsMutex.Lock()
	h.resolvedAlerts[alertID] = ResolvedDetails{
		Reason:         payload.Reason,
		SnoozeDuration: payload.SnoozeDuration,
	}
	h.alertsMutex.Unlock()

	// 2. Persist update to database alerts table
	_, err = h.gpsRepo.Pool().Exec(r.Context(), `
		UPDATE alerts 
		SET status = 'resolved', reason = $1, snooze_duration = $2 
		WHERE id = $3
	`, payload.Reason, payload.SnoozeDuration, alertID)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update alert in database: " + err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
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

func (h *Handler) DeleteVehicleType(w http.ResponseWriter, r *http.Request) {
	typeIDStr := chi.URLParam(r, "id")
	var typeID int
	fmt.Sscanf(typeIDStr, "%d", &typeID)

	if err := h.vRepo.DeleteType(r.Context(), typeID); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete type: " + err.Error()})
		return
	}
	h.publishMetadataUpdate(r.Context(), "type", typeID)
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

func (h *Handler) GetZones(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	rows, err := h.gpsRepo.Pool().Query(ctx, "SELECT id, region_name FROM regions WHERE region_type_id = 2 ORDER BY id ASC")
	if err != nil {
		sendJSON(w, http.StatusOK, map[string]interface{}{"code": 200, "data": []interface{}{}})
		return
	}
	defer rows.Close()

	var zones []map[string]interface{}
	for rows.Next() {
		var id int
		var name string
		if err := rows.Scan(&id, &name); err == nil {
			zones = append(zones, map[string]interface{}{
				"id":          id,
				"region_name": name,
				"name":        name,
			})
		}
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success":     true,
		"status_code": 200,
		"code":        200,
		"data":        zones,
	})
}

func (h *Handler) GetWards(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	rows, err := h.gpsRepo.Pool().Query(ctx, "SELECT id, region_name, parent_id FROM regions WHERE region_type_id = 3 ORDER BY id ASC")
	if err != nil {
		sendJSON(w, http.StatusOK, map[string]interface{}{"code": 200, "data": []interface{}{}})
		return
	}
	defer rows.Close()

	var wards []map[string]interface{}
	for rows.Next() {
		var id int
		var name string
		var parentID *int
		if err := rows.Scan(&id, &name, &parentID); err == nil {
			wards = append(wards, map[string]interface{}{
				"id":          id,
				"region_name": name,
				"parent_id":   parentID,
			})
		}
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success":     true,
		"status_code": 200,
		"code":        200,
		"data":        wards,
	})
}

type D2DAlert struct {
	ID             int       `json:"id"`
	AlertType      string    `json:"alert_type"`
	RegNo          string    `json:"reg_no"`
	WardNo         string    `json:"ward_no"`
	Driver         string    `json:"driver"`
	AlertDetail    string    `json:"alert_detail"`
	AlertCount     int       `json:"alert_count"`
	AlertTime      string    `json:"alert_time"`
	TimeReported   time.Time `json:"time_reported"`
	Status         string    `json:"status"`
	Reason         string    `json:"reason"`
	SnoozeDuration int       `json:"snooze_duration"`
	Lat            float64   `json:"lat"`
	Lng            float64   `json:"lng"`
	VehicleID      int       `json:"vehicle_id"`
}

type StartedVehicle struct {
	ID                     int       `json:"id"`
	RegNo                  string    `json:"reg_no"`
	WardNo                 string    `json:"ward_no"`
	Route                  string    `json:"route"`
	Driver                 string    `json:"driver"`
	DistanceCovered        float64   `json:"distance_covered"`
	RouteCoveredPercent    float64   `json:"route_covered_percent"`
	InorderRoutePercent    float64   `json:"inorder_route_percent"`
	GoingToTransferStation string    `json:"going_to_transfer_station"`
	LastUpdated            time.Time `json:"last_updated"`
	Lat                    float64   `json:"lat"`
	Lng                    float64   `json:"lng"`
	Heading                int       `json:"heading"`
	EmojiSequence          string    `json:"emoji_sequence"`
	CurrentStatus          string    `json:"current_status"`
}

type OtherVehicle struct {
	ID                     int        `json:"id"`
	RegNo                  string     `json:"reg_no"`
	WardNo                 string     `json:"ward_no"`
	Route                  string     `json:"route"`
	Driver                 string     `json:"driver"`
	CurrentStatus          string     `json:"current_status"`
	DistanceCovered        float64    `json:"distance_covered"`
	GoingToTransferStation string     `json:"going_to_transfer_station"`
	LastUpdated            *time.Time `json:"last_updated"`
}

type MapGeofence struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	Type        string  `json:"type"`
	Lat         float64 `json:"lat"`
	Lng         float64 `json:"lng"`
	RadiusMeter float64 `json:"radius_meter"`
}

func firstTimeLat(valid []decoder.AVLData) float64 {
	if len(valid) > 0 {
		return valid[0].Lat
	}
	return 0.0
}

func firstTimeLng(valid []decoder.AVLData) float64 {
	if len(valid) > 0 {
		return valid[0].Lng
	}
	return 0.0
}

func (h *Handler) triggerStoppageAlert(alerts *[]D2DAlert, hasAlert *[]bool, start, end decoder.AVLData, dur float64, regNo, wardNo, driver, dImei string, vID int) {
	durMin := dur / 60.0
	var alertType string
	var alertIndex int
	var detail string

	if durMin >= 15 {
		alertType = "Stoppage"
		alertIndex = 2
		detail = fmt.Sprintf("Stoppage of more than 15:00 Min(s) (Duration: %.1f Min)", durMin)
	} else if durMin >= 10 {
		alertType = "Stoppage"
		alertIndex = 1
		detail = fmt.Sprintf("Stoppage of more than 10:00 Min(s) (Duration: %.1f Min)", durMin)
	} else {
		alertType = "Stoppage"
		alertIndex = 0
		detail = fmt.Sprintf("Stoppage of more than 5:00 Min(s) (Duration: %.1f Min)", durMin)
	}

	(*hasAlert)[alertIndex] = true

	key := fmt.Sprintf("stoppage-%s-%d", dImei, start.Time.Unix())
	alertID := int(crc32.ChecksumIEEE([]byte(key)))

	status := "pending"
	reason := ""
	snooze := 0
	h.alertsMutex.Lock()
	if resolved, exists := h.resolvedAlerts[alertID]; exists {
		status = "resolved"
		reason = resolved.Reason
		snooze = resolved.SnoozeDuration
	}
	h.alertsMutex.Unlock()

	*alerts = append(*alerts, D2DAlert{
		ID:             alertID,
		AlertType:      alertType,
		RegNo:          regNo,
		WardNo:         wardNo,
		Driver:         driver,
		AlertDetail:    detail,
		AlertCount:     1,
		AlertTime:      start.Time.Format("03:04 PM"),
		TimeReported:   start.Time,
		Status:         status,
		Reason:         reason,
		SnoozeDuration: snooze,
		Lat:            start.Lat,
		Lng:            start.Lng,
		VehicleID:      vID,
	})
}

func (h *Handler) triggerOverspeedAlert(alerts *[]D2DAlert, hasAlert *[]bool, start, end decoder.AVLData, dur float64, regNo, wardNo, driver, dImei string, vID int) {
	(*hasAlert)[3] = true // Index 3 is Over Speeding

	key := fmt.Sprintf("overspeed-%s-%d", dImei, start.Time.Unix())
	alertID := int(crc32.ChecksumIEEE([]byte(key)))

	status := "pending"
	reason := ""
	snooze := 0
	h.alertsMutex.Lock()
	if resolved, exists := h.resolvedAlerts[alertID]; exists {
		status = "resolved"
		reason = resolved.Reason
		snooze = resolved.SnoozeDuration
	}
	h.alertsMutex.Unlock()

	durMin := math.Max(1.0, math.Round(dur/60.0))
	detail := fmt.Sprintf("Speed Over 10.10 Km/hr Since Last %.0f:0 Min(s)", durMin)

	*alerts = append(*alerts, D2DAlert{
		ID:             alertID,
		AlertType:      "Over Speeding",
		RegNo:          regNo,
		WardNo:         wardNo,
		Driver:         driver,
		AlertDetail:    detail,
		AlertCount:     1,
		AlertTime:      start.Time.Format("03:04 PM"),
		TimeReported:   start.Time,
		Status:         status,
		Reason:         reason,
		SnoozeDuration: snooze,
		Lat:            start.Lat,
		Lng:            start.Lng,
		VehicleID:      vID,
	})
}

func (h *Handler) GetD2DDashboard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	// Determine currently active shift based on server time
	var activeShiftID int
	var activeShiftName string
	var shiftStart, shiftEnd time.Time
	now := time.Now()
	shiftRows, err := h.gpsRepo.Pool().Query(ctx, `SELECT id, shift_name, start_time, end_time FROM shifts WHERE is_active = true`)
	if err == nil {
		defer shiftRows.Close()
		for shiftRows.Next() {
			var id int
			var name string
			var start, end time.Time
			if err := shiftRows.Scan(&id, &name, &start, &end); err != nil {
				continue
			}

			sh, sm, ss := start.Hour(), start.Minute(), start.Second()
			eh, em, es := end.Hour(), end.Minute(), end.Second()

			curMin := now.Hour()*60 + now.Minute()
			stMin := sh*60 + sm
			etMin := eh*60 + em

			isWithinShift := false
			var actualStart, actualEnd time.Time

			if stMin < etMin {
				// Shift is on the same day (e.g. 06:00 to 14:00)
				if curMin >= stMin && curMin <= etMin {
					isWithinShift = true
					actualStart = time.Date(now.Year(), now.Month(), now.Day(), sh, sm, ss, 0, now.Location())
					actualEnd = time.Date(now.Year(), now.Month(), now.Day(), eh, em, es, 0, now.Location())
				}
			} else {
				// Shift crosses midnight (e.g. 22:00 to 06:00)
				if curMin >= stMin || curMin <= etMin {
					isWithinShift = true
					if curMin >= stMin {
						actualStart = time.Date(now.Year(), now.Month(), now.Day(), sh, sm, ss, 0, now.Location())
						tomorrow := now.Add(24 * time.Hour)
						actualEnd = time.Date(tomorrow.Year(), tomorrow.Month(), tomorrow.Day(), eh, em, es, 0, now.Location())
					} else {
						yesterday := now.Add(-24 * time.Hour)
						actualStart = time.Date(yesterday.Year(), yesterday.Month(), yesterday.Day(), sh, sm, ss, 0, now.Location())
						actualEnd = time.Date(now.Year(), now.Month(), now.Day(), eh, em, es, 0, now.Location())
					}
				}
			}

			if isWithinShift {
				activeShiftID = id
				activeShiftName = name
				shiftStart = actualStart
				shiftEnd = actualEnd
				break
			}
		}
	}

	todayStr := time.Now().Format("2006-01-02")
	
	// Fetch coverage data for the specific active shift date or today
	coverageDateStr := todayStr
	if !shiftStart.IsZero() {
		coverageDateStr = shiftStart.Format("2006-01-02")
	}
	coverageData, _ := h.routeRepo.GetDashboardCoverageData(ctx, coverageDateStr)

	// Define time window for alerts queries
	var alertStart, alertEnd time.Time
	if !shiftStart.IsZero() && !shiftEnd.IsZero() {
		alertStart, alertEnd = shiftStart, shiftEnd
	} else {
		now := time.Now()
		alertStart = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		alertEnd = alertStart.Add(24 * time.Hour)
	}

	// 1. Fetch pre-computed alerts from PostgreSQL alerts table for the time window
	alertQuery := `
		SELECT id, alert_type, imei, vehicle_id, registration_no, COALESCE(ward_no, ''), COALESCE(driver, ''), COALESCE(alert_detail, ''), time_reported, status, snooze_duration, COALESCE(reason, ''), lat, lng
		FROM alerts
		WHERE time_reported >= $1 AND time_reported < $2
		ORDER BY time_reported DESC
	`
	aRows, err := h.gpsRepo.Pool().Query(ctx, alertQuery, alertStart, alertEnd)
	
	var alerts []D2DAlert
	var unauthorizedVehicles []D2DAlert
	vehicleAlertTypes := make(map[int]map[string]string) // vehicleID -> alertType -> detail

	if err == nil {
		defer aRows.Close()
		for aRows.Next() {
			var a D2DAlert
			var detail, reason, imei string
			err := aRows.Scan(
				&a.ID, &a.AlertType, &imei, &a.VehicleID, &a.RegNo,
				&a.WardNo, &a.Driver, &detail, &a.TimeReported, &a.Status,
				&a.SnoozeDuration, &reason, &a.Lat, &a.Lng,
			)
			if err != nil {
				continue
			}
			a.AlertDetail = detail
			a.Reason = reason
			a.AlertTime = a.TimeReported.Format("03:04 PM")
			alerts = append(alerts, a)

			if vehicleAlertTypes[a.VehicleID] == nil {
				vehicleAlertTypes[a.VehicleID] = make(map[string]string)
			}
			vehicleAlertTypes[a.VehicleID][a.AlertType] = detail

			if a.AlertType == "Unauthorized Movement" {
				unauthorizedVehicles = append(unauthorizedVehicles, a)
			}
		}
	}

	// 2. Query active vehicles joining the lightweight latest_gps_data cache table
	var rows interface {
		Close()
		Next() bool
		Scan(dest ...any) error
	}

	if activeShiftID > 0 {
		query := `
			SELECT 
				v.id, v.registration_no, COALESCE(v.chassis_no, ''), v.is_owned, v.vehicle_type_id, v.is_active,
				COALESCE(vt.vehicle_type_name, 'Hopper Tipper'), COALESCE(vt.icon_color, '#10b981'),
				COALESCE(d.id, 0), COALESCE(d.imei, ''), COALESCE(d.serial_no, ''), COALESCE(d.sim_no, ''), COALESCE(d.device_type, ''), COALESCE(d.is_active, false),
				COALESCE(v.zone_id, 0), COALESCE(z.region_name, 'Zone 1 - Hawa Mahal-Aamer Zone'),
				COALESCE(v.ward_id, 0), COALESCE(w.region_name, '15 - Ward - 15'),
				COALESCE(lp.lat, 0.0), COALESCE(lp.lng, 0.0), lp.captured_at
			FROM vehicles v
			JOIN vehicle_route_assignments va ON v.id = va.vehicle_id AND va.is_active = true
			JOIN routes r ON va.route_id = r.id AND r.is_active = true
			JOIN shifts s ON r.shift_id = s.id AND s.is_active = true
			LEFT JOIN vehicle_types_iswm vt ON v.vehicle_type_id = vt.id
			LEFT JOIN vehicle_gps_map m ON v.id = m.vehicle_id AND m.unassigned_at IS NULL
			LEFT JOIN gps_devices d ON m.device_id = d.id
			LEFT JOIN regions z ON v.zone_id = z.id AND z.region_type_id = 2
			LEFT JOIN regions w ON v.ward_id = w.id AND w.region_type_id = 3
			LEFT JOIN latest_gps_data lp ON d.imei = lp.imei
			WHERE va.assigned_date = $1 AND s.id = $2
		`
		assignedDateStr := shiftStart.Format("2006-01-02")
		rows, err = h.gpsRepo.Pool().Query(ctx, query, assignedDateStr, activeShiftID)
	} else {
		query := `
			SELECT 
				v.id, v.registration_no, COALESCE(v.chassis_no, ''), v.is_owned, v.vehicle_type_id, v.is_active,
				COALESCE(vt.vehicle_type_name, 'Hopper Tipper'), COALESCE(vt.icon_color, '#10b981'),
				COALESCE(d.id, 0), COALESCE(d.imei, ''), COALESCE(d.serial_no, ''), COALESCE(d.sim_no, ''), COALESCE(d.device_type, ''), COALESCE(d.is_active, false),
				COALESCE(v.zone_id, 0), COALESCE(z.region_name, 'Zone 1 - Hawa Mahal-Aamer Zone'),
				COALESCE(v.ward_id, 0), COALESCE(w.region_name, '15 - Ward - 15'),
				COALESCE(lp.lat, 0.0), COALESCE(lp.lng, 0.0), lp.captured_at
			FROM vehicles v
			JOIN vehicle_route_assignments va ON v.id = va.vehicle_id AND va.is_active = true
			JOIN routes r ON va.route_id = r.id AND r.is_active = true
			JOIN shifts s ON r.shift_id = s.id AND s.is_active = true
			LEFT JOIN vehicle_types_iswm vt ON v.vehicle_type_id = vt.id
			LEFT JOIN vehicle_gps_map m ON v.id = m.vehicle_id AND m.unassigned_at IS NULL
			LEFT JOIN gps_devices d ON m.device_id = d.id
			LEFT JOIN regions z ON v.zone_id = z.id AND z.region_type_id = 2
			LEFT JOIN regions w ON v.ward_id = w.id AND w.region_type_id = 3
			LEFT JOIN latest_gps_data lp ON d.imei = lp.imei
			WHERE va.assigned_date = $1
		`
		rows, err = h.gpsRepo.Pool().Query(ctx, query, todayStr)
	}

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query vehicles: " + err.Error()})
		return
	}
	defer rows.Close()

	var startedVehicles []StartedVehicle
	var otherVehicles []OtherVehicle

	for rows.Next() {
		var vID, vtID, dID, zoneID, wardID int
		var regNo, chassisNo, vtName, vtColor, dImei, dSerial, dSim, dDevType, zName, wName string
		var isOwned, vActive, dActive bool
		var lastLat, lastLng float64
		var lastTime *time.Time

		err := rows.Scan(
			&vID, &regNo, &chassisNo, &isOwned, &vtID, &vActive,
			&vtName, &vtColor, &dID, &dImei, &dSim, &dSerial, &dDevType, &dActive,
			&zoneID, &zName, &wardID, &wName,
			&lastLat, &lastLng, &lastTime,
		)
		if err != nil {
			continue
		}

		driverName := "Driver-" + strconv.Itoa(vID)
		if vID == 1245 {
			driverName = "Rajesh Kumar"
		} else if vID == 1246 {
			driverName = "Suresh Sharma"
		}

		wardNo := wName
		if len(wName) > 0 {
			var wardNum int
			if _, err := fmt.Sscanf(wName, "%d", &wardNum); err == nil {
				wardNo = strconv.Itoa(wardNum)
			}
		}

		// Offline state detection
		isOffline := lastTime == nil || lastLat == 0.0 || lastLng == 0.0 || (time.Since(*lastTime) > 15*time.Minute)

		if dImei == "" || lastTime == nil || lastLat == 0.0 || lastLng == 0.0 {
			otherVehicles = append(otherVehicles, OtherVehicle{
				ID:                     vID,
				RegNo:                  regNo,
				WardNo:                 wardNo,
				Route:                  "ROUTE_" + wardNo,
				Driver:                 driverName,
				CurrentStatus:          "Offline",
				DistanceCovered:        0.0,
				GoingToTransferStation: "No",
				LastUpdated:            nil,
			})
			continue
		}

		// Retrieve pre-accumulated daily distance covered from Redis
		distCovered, _ := h.rdb.Get(ctx, fmt.Sprintf("trip:distance:%s", dImei)).Float64()

		cov := coverageData[vID]
		routeCoveredPercent := 0.0
		inorderRoutePercent := 0.0
		if cov.TotalCheckpoints > 0 {
			routeCoveredPercent = math.Round((float64(cov.CoveredCheckpoints) / float64(cov.TotalCheckpoints)) * 100)
			inorderRoutePercent = math.Round((float64(cov.InOrderHits) / float64(cov.TotalCheckpoints)) * 100)
		} else if distCovered > 0 {
			routeCoveredPercent = math.Min(100.0, (distCovered/12.0)*100.0)
			inorderRoutePercent = math.Min(100.0, (distCovered/13.5)*100.0)
		}

		// Geofence checks
		goingToTS := "No"
		tsLat, tsLng := 26.9239, 75.8267
		if haversine(lastLat, lastLng, tsLat, tsLng) < 0.2 {
			goingToTS = "Yes"
		}

		// Build Emoji Sequence using the mapped background alerts
		hasAlert := make([]bool, 10)
		activeAlerts := vehicleAlertTypes[vID]
		
		if activeAlerts != nil {
			if detail, exists := activeAlerts["Stoppage"]; exists {
				var stopDur float64
				if _, err := fmt.Sscanf(detail, "Stoppage of more than 5:00 Min(s) (Duration: %f Min)", &stopDur); err == nil {
					if stopDur >= 15 {
						hasAlert[2] = true
					} else if stopDur >= 10 {
						hasAlert[1] = true
					} else {
						hasAlert[0] = true
					}
				} else {
					hasAlert[0] = true
				}
			}
			if _, exists := activeAlerts["Over Speeding"]; exists {
				hasAlert[3] = true
			}
			if _, exists := activeAlerts["Deviation"]; exists {
				hasAlert[5] = true
			}
			if _, exists := activeAlerts["Delay"]; exists {
				hasAlert[6] = true
			}
			if _, exists := activeAlerts["Late Started"]; exists {
				hasAlert[7] = true
			}
			if _, exists := activeAlerts["Unauthorized Movement"]; exists {
				hasAlert[8] = true
			}
		}

		if isOffline {
			hasAlert[9] = true
		}

		emojiSeq := ""
		emojis := []string{
			"🟡", "🟠", "🔴", "⚡", "🛻", "🍎", "⏱️", "🕒", "🛡️", "📴",
		}
		for idx, trigger := range hasAlert {
			if trigger {
				emojiSeq += emojis[idx] + " "
			} else {
				emojiSeq += "🚫 "
			}
		}
		emojiSeq = strings.TrimSpace(emojiSeq)

		vStatus := "Moving"
		// If offline or has a stoppage alert, set status to stopped
		if isOffline || (activeAlerts != nil && activeAlerts["Stoppage"] != "") {
			vStatus = "Stopped"
		}

		startedVehicles = append(startedVehicles, StartedVehicle{
			ID:                     vID,
			RegNo:                  regNo,
			WardNo:                 wardNo,
			Route:                  "ROUTE_" + wardNo,
			Driver:                 driverName,
			DistanceCovered:        distCovered,
			RouteCoveredPercent:    routeCoveredPercent,
			InorderRoutePercent:    inorderRoutePercent,
			GoingToTransferStation: goingToTS,
			LastUpdated:            *lastTime,
			Lat:                    lastLat,
			Lng:                    lastLng,
			Heading:                0,
			EmojiSequence:          emojiSeq,
			CurrentStatus:          vStatus,
		})
	}

	geofences := []MapGeofence{
		{ID: 1, Name: "HawaMahal Parking", Type: "Parking Lot", Lat: 26.9250, Lng: 75.8236, RadiusMeter: 100},
		{ID: 2, Name: "Hawa Mahal Transfer Station", Type: "Transfer Station", Lat: 26.9239, Lng: 75.8267, RadiusMeter: 150},
		{ID: 3, Name: "Hawa Mahal Fuel Station", Type: "Fuel Station", Lat: 26.9180, Lng: 75.8150, RadiusMeter: 80},
		{ID: 4, Name: "Central Workshop", Type: "Workshop", Lat: 26.9320, Lng: 75.8050, RadiusMeter: 200},
	}

	payload := map[string]interface{}{
		"success":               true,
		"status_code":           200,
		"active_shift":          activeShiftName,
		"alerts":                alerts,
		"started_vehicles":      startedVehicles,
		"unauthorized_vehicles": unauthorizedVehicles,
		"other_vehicles":        otherVehicles,
		"geofences":             geofences,
	}

	sendJSON(w, http.StatusOK, payload)
}

