package api

import (
	"net/http"
	"strconv"
)

type ActiveVehicleSummaryRow struct {
	ZoneID           int    `json:"zone_id"`
	ZoneName         string `json:"zone_name"`
	TotalVehicles    int    `json:"total_vehicles"`
	ActiveVehicles   int    `json:"active_vehicles"`
	InactiveVehicles int    `json:"inactive_vehicles"`
}

func (h *Handler) GetActiveVehicleSummaryReport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	// Parse optional filters
	zoneIDStr := r.URL.Query().Get("zone_id")
	var zoneID *int
	if zoneIDStr != "" && zoneIDStr != "null" {
		if id, err := strconv.Atoi(zoneIDStr); err == nil && id > 0 {
			zoneID = &id
		}
	}

	vtIDStr := r.URL.Query().Get("vehicle_type_id")
	var vtID *int
	if vtIDStr != "" && vtIDStr != "null" {
		if id, err := strconv.Atoi(vtIDStr); err == nil && id > 0 {
			vtID = &id
		}
	}

	query := `
		SELECT 
			z.id AS zone_id,
			z.region_name AS zone_name,
			COUNT(v.id) AS total_vehicles,
			COUNT(CASE WHEN v.id IS NOT NULL AND lp.captured_at >= NOW() - INTERVAL '15 minutes' THEN 1 END) AS active_vehicles,
			COUNT(CASE WHEN v.id IS NOT NULL AND (lp.captured_at IS NULL OR lp.captured_at < NOW() - INTERVAL '15 minutes') THEN 1 END) AS inactive_vehicles
		FROM regions z
		LEFT JOIN vehicles v ON z.id = v.zone_id AND ($1::int IS NULL OR v.vehicle_type_id = $1) AND v.is_active = true
		LEFT JOIN vehicle_gps_map m ON v.id = m.vehicle_id AND m.unassigned_at IS NULL
		LEFT JOIN gps_devices d ON m.device_id = d.id
		LEFT JOIN latest_gps_data lp ON d.imei = lp.imei
		WHERE z.region_type_id = 2 -- Zone
		  AND ($2::int IS NULL OR z.id = $2)
		GROUP BY z.id, z.region_name
		ORDER BY z.region_name ASC
	`

	rows, err := db.Query(ctx, query, vtID, zoneID)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query active vehicle summary: " + err.Error()})
		return
	}
	defer rows.Close()

	var data []ActiveVehicleSummaryRow = []ActiveVehicleSummaryRow{}
	for rows.Next() {
		var row ActiveVehicleSummaryRow
		err := rows.Scan(
			&row.ZoneID,
			&row.ZoneName,
			&row.TotalVehicles,
			&row.ActiveVehicles,
			&row.InactiveVehicles,
		)
		if err == nil {
			data = append(data, row)
		}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    data,
	})
}

type ActiveVehicleSummaryByWardRow struct {
	WardID           int    `json:"ward_id"`
	WardName         string `json:"ward_name"`
	ZoneID           int    `json:"zone_id"`
	ZoneName         string `json:"zone_name"`
	TotalVehicles    int    `json:"total_vehicles"`
	ActiveVehicles   int    `json:"active_vehicles"`
	InactiveVehicles int    `json:"inactive_vehicles"`
}

func (h *Handler) GetActiveVehicleSummaryByWardReport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	// Parse optional filters
	zoneIDStr := r.URL.Query().Get("zone_id")
	var zoneID *int
	if zoneIDStr != "" && zoneIDStr != "null" {
		if id, err := strconv.Atoi(zoneIDStr); err == nil && id > 0 {
			zoneID = &id
		}
	}

	wardIDStr := r.URL.Query().Get("ward_id")
	var wardID *int
	if wardIDStr != "" && wardIDStr != "null" {
		if id, err := strconv.Atoi(wardIDStr); err == nil && id > 0 {
			wardID = &id
		}
	}

	vtIDStr := r.URL.Query().Get("vehicle_type_id")
	var vtID *int
	if vtIDStr != "" && vtIDStr != "null" {
		if id, err := strconv.Atoi(vtIDStr); err == nil && id > 0 {
			vtID = &id
		}
	}

	query := `
		SELECT 
			w.id AS ward_id,
			COALESCE(w.region_name, '') AS ward_name,
			COALESCE(z.id, 0) AS zone_id,
			COALESCE(z.region_name, 'Unknown Zone') AS zone_name,
			COUNT(v.id) AS total_vehicles,
			COUNT(CASE WHEN v.id IS NOT NULL AND lp.captured_at >= NOW() - INTERVAL '15 minutes' THEN 1 END) AS active_vehicles,
			COUNT(CASE WHEN v.id IS NOT NULL AND (lp.captured_at IS NULL OR lp.captured_at < NOW() - INTERVAL '15 minutes') THEN 1 END) AS inactive_vehicles
		FROM regions w
		LEFT JOIN regions z ON w.parent_id = z.id AND z.region_type_id = 2
		LEFT JOIN vehicles v ON w.id = v.ward_id AND ($1::int IS NULL OR v.vehicle_type_id = $1) AND v.is_active = true
		LEFT JOIN vehicle_gps_map m ON v.id = m.vehicle_id AND m.unassigned_at IS NULL
		LEFT JOIN gps_devices d ON m.device_id = d.id
		LEFT JOIN latest_gps_data lp ON d.imei = lp.imei
		WHERE w.region_type_id = 3 -- Ward
		  AND ($2::int IS NULL OR z.id = $2)
		  AND ($3::int IS NULL OR w.id = $3)
		GROUP BY w.id, w.region_name, z.id, z.region_name
		ORDER BY z.region_name ASC, w.region_name ASC
	`

	rows, err := db.Query(ctx, query, vtID, zoneID, wardID)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query ward active vehicle summary: " + err.Error()})
		return
	}
	defer rows.Close()

	var data []ActiveVehicleSummaryByWardRow = []ActiveVehicleSummaryByWardRow{}
	for rows.Next() {
		var row ActiveVehicleSummaryByWardRow
		err := rows.Scan(
			&row.WardID,
			&row.WardName,
			&row.ZoneID,
			&row.ZoneName,
			&row.TotalVehicles,
			&row.ActiveVehicles,
			&row.InactiveVehicles,
		)
		if err == nil {
			data = append(data, row)
		}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    data,
	})
}
