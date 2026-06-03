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
