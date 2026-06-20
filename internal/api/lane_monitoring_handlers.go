package api

import (
	"encoding/json"
	"gps-tracking-system/internal/utils"
	"net/http"
	"strconv"
	"time"
)

type LaneReportRow struct {
	LaneName  string     `json:"lane_name"`
	StartTime *time.Time `json:"start_time"`
	EndTime   *time.Time `json:"end_time"`
}

func (h *Handler) GetLaneMonitoringReport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	routeIDStr := r.URL.Query().Get("route_id")
	if routeIDStr == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "route_id is required"})
		return
	}

	routeID, err := strconv.Atoi(routeIDStr)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid route_id"})
		return
	}

	// Parse date filter, defaulting to today
	dateStr := r.URL.Query().Get("date")
	var reportDate time.Time
	if dateStr != "" {
		reportDate, err = time.ParseInLocation("2006-01-02", dateStr, utils.IndianLocation)
		if err != nil {
			sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid date format, use YYYY-MM-DD"})
			return
		}
	} else {
		reportDate = utils.CurrentTimeInIndia()
	}
	dateFilter := reportDate.Format("2006-01-02")

	// 1. Find active vehicle for route on this date
	// Check temporary_vehicles (override) first
	var vehicleID int
	err = db.QueryRow(ctx, `
		SELECT vehicle_id FROM temporary_vehicles
		WHERE route_id = $1 AND assignment_date = $2
		LIMIT 1
	`, routeID, dateFilter).Scan(&vehicleID)

	if err != nil {
		// Fallback to vehicle_route_assignments
		err = db.QueryRow(ctx, `
			SELECT vehicle_id FROM vehicle_route_assignments
			WHERE route_id = $1 AND is_active = true
			ORDER BY assigned_date DESC, id DESC
			LIMIT 1
		`, routeID).Scan(&vehicleID)
	}

	// 2. Fetch all lane points for the route
	type DBCheckpoint struct {
		ID             int
		CheckpointName string
		SequenceOrder  int
	}

	cpRows, err := db.Query(ctx, `
		SELECT id, 'Point #' || sequence_number::text, sequence_number
		FROM route_lane_points
		WHERE route_id = $1
		ORDER BY sequence_number ASC
	`, routeID)

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch route lane points: " + err.Error()})
		return
	}
	defer cpRows.Close()

	var checkpoints []DBCheckpoint
	for cpRows.Next() {
		var cp DBCheckpoint
		if err := cpRows.Scan(&cp.ID, &cp.CheckpointName, &cp.SequenceOrder); err == nil {
			checkpoints = append(checkpoints, cp)
		}
	}

	// 3. Fetch hit details from vehicle_lane_point_coverage
	hitTimes := make(map[int]time.Time)
	if vehicleID > 0 && len(checkpoints) > 0 {
		var detailsJSON []byte
		err := db.QueryRow(ctx, `
			SELECT details
			FROM vehicle_lane_point_coverage
			WHERE vehicle_id = $1 AND route_id = $2 AND report_date = $3
		`, vehicleID, routeID, dateFilter).Scan(&detailsJSON)

		if err == nil && len(detailsJSON) > 0 {
			type Detail struct {
				LanePointID int        `json:"lane_point_id"`
				Status      string     `json:"status"`
				HitTime     *time.Time `json:"hit_time"`
			}
			var details []Detail
			if err := json.Unmarshal(detailsJSON, &details); err == nil {
				for _, d := range details {
					if d.Status == "achieved" && d.HitTime != nil {
						hitTimes[d.LanePointID] = *d.HitTime
					}
				}
			}
		}
	}

	var reportData []LaneReportRow

	// List each lane point as a separate row
	for _, cp := range checkpoints {
		row := LaneReportRow{
			LaneName: cp.CheckpointName,
		}
		if t, ok := hitTimes[cp.ID]; ok {
			row.StartTime = &t
			row.EndTime = &t // For single point, start and end are the same
		}
		reportData = append(reportData, row)
	}

	if reportData == nil {
		reportData = []LaneReportRow{}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    reportData,
	})
}
