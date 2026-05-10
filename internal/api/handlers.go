package api

import (
	"context"
	"encoding/json"
	"fmt"
	"gps-tracking-system/internal/repository"
	"gps-tracking-system/internal/service"
	"hash/crc32"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/redis/go-redis/v9"
)

type Handler struct {
	vRepo             *repository.VehicleRepository
	gpsRepo           *repository.GPSRepository
	rService          *service.ReportService
	rdb               *redis.Client
	vehicleZones      map[string]int
	vehicleWards      map[string]int
	zoneVehiclesCache map[string][]map[string]interface{}
	cacheMutex        sync.RWMutex
}

func NewHandler(vRepo *repository.VehicleRepository, gpsRepo *repository.GPSRepository, rService *service.ReportService, rdb *redis.Client) *Handler {
	h := &Handler{
		vRepo:             vRepo,
		gpsRepo:           gpsRepo,
		rService:          rService,
		rdb:               rdb,
		vehicleZones:      make(map[string]int),
		vehicleWards:      make(map[string]int),
		zoneVehiclesCache: make(map[string][]map[string]interface{}),
	}
	h.LoadMappings()
	h.RebuildCache()
	return h
}

func (h *Handler) LoadMappings() {
	data, err := os.ReadFile("E:\\dataswim\\iswmmovement.json")
	if err != nil {
		fmt.Printf("Failed to read iswmmovement.json for mappings: %v\n", err)
		return
	}

	// Try parsing old structure
	var resultOld struct {
		Data []struct {
			RegistrationNo string `json:"registration_no"`
			Regions        []struct {
				ID int `json:"id"`
			} `json:"regions"`
			SubRegions []struct {
				ID int `json:"id"`
			} `json:"sub_regions"`
		} `json:"data"`
	}

	if err := json.Unmarshal(data, &resultOld); err == nil && len(resultOld.Data) > 0 && len(resultOld.Data[0].Regions) > 0 {
		for _, v := range resultOld.Data {
			if len(v.Regions) > 0 {
				h.vehicleZones[v.RegistrationNo] = v.Regions[0].ID
			}
			if len(v.SubRegions) > 0 {
				h.vehicleWards[v.RegistrationNo] = v.SubRegions[0].ID
			}
		}
		fmt.Printf("Loaded %d vehicle-zone mappings and %d vehicle-ward mappings (Old Structure)\n", len(h.vehicleZones), len(h.vehicleWards))
		return
	}

	// Try parsing new structure (assuming it's an array of vehicles)
	var resultNew []struct {
		Number string `json:"number"`
		ZoneId struct {
			ID   string `json:"_id"`
			Name string `json:"name"`
		} `json:"zoneId"`
	}

	if err := json.Unmarshal(data, &resultNew); err == nil && len(resultNew) > 0 {
		for _, v := range resultNew {
			if v.ZoneId.ID != "" {
				zoneID := int(crc32.ChecksumIEEE([]byte(v.ZoneId.ID)))
				h.vehicleZones[v.Number] = zoneID
			}
		}
		fmt.Printf("Loaded %d vehicle-zone mappings (New Structure)\n", len(h.vehicleZones))
		return
	}

	// Try parsing new structure wrapped in a "data" field
	var resultNewWrapped struct {
		Data []struct {
			Number string `json:"number"`
			ZoneId struct {
				ID   string `json:"_id"`
				Name string `json:"name"`
			} `json:"zoneId"`
		} `json:"data"`
	}

	if err := json.Unmarshal(data, &resultNewWrapped); err == nil && len(resultNewWrapped.Data) > 0 {
		for _, v := range resultNewWrapped.Data {
			if v.ZoneId.ID != "" {
				zoneID := int(crc32.ChecksumIEEE([]byte(v.ZoneId.ID)))
				h.vehicleZones[v.Number] = zoneID
			}
		}
		fmt.Printf("Loaded %d vehicle-zone mappings (New Wrapped Structure)\n", len(h.vehicleZones))
		return
	}

	fmt.Println("Failed to parse iswmmovement.json with any supported structure")
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
		
		var zoneID int
		if zid, ok := h.vehicleZones[v.RegistrationNo]; ok {
			m["zone_id"] = zid
			zoneID = zid
		}
		if wardID, ok := h.vehicleWards[v.RegistrationNo]; ok {
			m["ward_id"] = wardID
		}
		
		allVehicles = append(allVehicles, m)
		
		if zoneID > 0 {
			zoneStr := strconv.Itoa(zoneID)
			newCache[zoneStr] = append(newCache[zoneStr], m)
		}
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
	data, err := os.ReadFile("E:\\dataswim\\iswmmovement.json")
	if err != nil {
		sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": []interface{}{}, "total": 0, "page": 1, "limit": 10, "total_pages": 0})
		return
	}
	
	var result struct {
		Data []struct {
			RegistrationNo string `json:"registration_no"`
			VehicleTypes   struct {
				VehicleTypeName string `json:"vehicle_type_name"`
			} `json:"vehicle_types"`
			MovementReports []struct {
				ID                       int64   `json:"id"`
				ReportDate               string  `json:"report_date"`
				AverageSpeed             float64 `json:"average_speed"`
				TotalDistance            float64 `json:"total_distance"`
				StartTime                string  `json:"start_time"`
				EndTime                  string  `json:"end_time"`
				TotalActiveDuration      string  `json:"total_active_duration"`
				TotalIdleDuration        string  `json:"total_idle_duration"`
				TotalStoppageDuration    string  `json:"total_stoppage_duration"`
				ActualIgnitionOnDuration string  `json:"actual_ignition_on_duration"`
				TotalIgnitionOnDuration  string  `json:"total_ignition_on_duration"`
				Alert                    int     `json:"alert"`
				StartPoint               struct {
					X float64 `json:"x"`
					Y float64 `json:"y"`
				} `json:"start_point"`
				EndPoint struct {
					X float64 `json:"x"`
					Y float64 `json:"y"`
				} `json:"end_point"`
			} `json:"movement_reports"`
		} `json:"data"`
	}
	
	if err := json.Unmarshal(data, &result); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to parse movement data"})
		return
	}
	
	var flattened []map[string]interface{}
	for _, v := range result.Data {
		for _, rep := range v.MovementReports {
			startPointJSON := fmt.Sprintf("{\"lng\": %f, \"lat\": %f}", rep.StartPoint.X, rep.StartPoint.Y)
			endPointJSON := fmt.Sprintf("{\"lng\": %f, \"lat\": %f}", rep.EndPoint.X, rep.EndPoint.Y)
			
			flattened = append(flattened, map[string]interface{}{
				"id":                           rep.ID,
				"report_date":                  rep.ReportDate,
				"registration_no":              v.RegistrationNo,
				"vehicle_type":                 v.VehicleTypes.VehicleTypeName,
				"start_point":                  startPointJSON,
				"end_point":                    endPointJSON,
				"start_time":                   rep.StartTime,
				"end_time":                     rep.EndTime,
				"total_active_duration":       rep.TotalActiveDuration,
				"total_distance":              rep.TotalDistance,
				"average_speed":               rep.AverageSpeed,
				"actual_ignition_on_duration":  rep.ActualIgnitionOnDuration,
				"total_ignition_on_duration":   rep.TotalIgnitionOnDuration,
				"total_stoppage_duration":     rep.TotalStoppageDuration,
				"total_idle_duration":         rep.TotalIdleDuration,
				"alert":                        rep.Alert,
				"zone_id":                      h.vehicleZones[v.RegistrationNo],
				"ward_id":                      h.vehicleWards[v.RegistrationNo],
			})
		}
	}
	
	// Pagination
	pageStr := r.URL.Query().Get("page")
	limitStr := r.URL.Query().Get("limit")
	page := 1
	limit := 10
	if pageStr != "" {
		fmt.Sscanf(pageStr, "%d", &page)
	}
	if limitStr != "" {
		fmt.Sscanf(limitStr, "%d", &limit)
	}
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 10
	}
	
	total := len(flattened)
	offset := (page - 1) * limit
	if offset > total {
		offset = total
	}
	end := offset + limit
	if end > total {
		end = total
	}
	
	pagedData := flattened[offset:end]
	totalPages := (total + limit - 1) / limit
	
	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success":     true,
		"data":        pagedData,
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

func (h *Handler) GetZones(w http.ResponseWriter, r *http.Request) {
	data, err := os.ReadFile("E:\\dataswim\\iswm zone data.json")
	if err != nil {
		sendJSON(w, http.StatusOK, map[string]interface{}{"code": 200, "data": []interface{}{}})
		return
	}
	
	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to parse zone data"})
		return
	}
	
	// Check if it has the new structure and transform it if needed
	if code, ok := result["code"].(float64); ok && code == 200 {
		if dataArr, ok := result["data"].([]interface{}); ok {
			var transformedData []map[string]interface{}
			for _, item := range dataArr {
				if m, ok := item.(map[string]interface{}); ok {
					newItem := make(map[string]interface{})
					for k, v := range m {
						newItem[k] = v
					}
					
					// Map _id to id (as int using CRC32) if _id exists and id does not
					if idStr, ok := m["_id"].(string); ok {
						if _, hasId := m["id"]; !hasId {
							newItem["id"] = int(crc32.ChecksumIEEE([]byte(idStr)))
						}
					}
					// Map name to region_name if name exists and region_name does not
					if nameStr, ok := m["name"].(string); ok {
						if _, hasRegionName := m["region_name"]; !hasRegionName {
							newItem["region_name"] = nameStr
						}
					}
					
					transformedData = append(transformedData, newItem)
				}
			}
			result["data"] = transformedData
		}
	}
	
	sendJSON(w, http.StatusOK, result)
}

func (h *Handler) GetWards(w http.ResponseWriter, r *http.Request) {
	data, err := os.ReadFile("E:\\dataswim\\swimwarddata.json")
	if err != nil {
		sendJSON(w, http.StatusOK, map[string]interface{}{"code": 200, "data": []interface{}{}})
		return
	}
	
	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to parse ward data"})
		return
	}
	
	sendJSON(w, http.StatusOK, result)
}
