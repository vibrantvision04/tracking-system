package api

import (
	"net/http"
	"strconv"
	"strings"
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
		reportDate, err = time.Parse("2006-01-02", dateStr)
		if err != nil {
			sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid date format, use YYYY-MM-DD"})
			return
		}
	} else {
		reportDate = time.Now()
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
			WHERE route_id = $1 AND assigned_date = $2 AND is_active = true
			LIMIT 1
		`, routeID, dateFilter).Scan(&vehicleID)
	}

	// 2. Fetch all checkpoints for the route
	type DBCheckpoint struct {
		ID             int
		CheckpointName string
		SequenceOrder  int
	}

	cpRows, err := db.Query(ctx, `
		SELECT id, checkpoint_name, sequence_order
		FROM route_checkpoints
		WHERE route_id = $1
		ORDER BY sequence_order ASC
	`, routeID)

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch route checkpoints: " + err.Error()})
		return
	}
	defer cpRows.Close()

	var checkpoints []DBCheckpoint
	seenNames := make(map[string]bool)
	for cpRows.Next() {
		var cp DBCheckpoint
		if err := cpRows.Scan(&cp.ID, &cp.CheckpointName, &cp.SequenceOrder); err == nil {
			if !seenNames[cp.CheckpointName] {
				seenNames[cp.CheckpointName] = true
				checkpoints = append(checkpoints, cp)
			}
		}
	}

	// 3. Fetch hit logs if vehicle is assigned
	hitTimes := make(map[int]time.Time)
	if vehicleID > 0 && len(checkpoints) > 0 {
		logRows, err := db.Query(ctx, `
			SELECT checkpoint_id, hit_time
			FROM route_coverage_logs
			WHERE vehicle_id = $1 AND route_id = $2 AND report_date = $3
		`, vehicleID, routeID, dateFilter)

		if err == nil {
			defer logRows.Close()
			for logRows.Next() {
				var cpID int
				var hitTime time.Time
				if err := logRows.Scan(&cpID, &hitTime); err == nil {
					hitTimes[cpID] = hitTime
				}
			}
		}
	}

	// 4. Group checkpoints into lanes
	// Structure to hold start/end checkpoints for a lane
	type LaneTemp struct {
		LaneOrder  int
		StartCPID  int
		EndCPID    int
		HasStart   bool
		HasEnd     bool
	}

	lanesMap := make(map[int]*LaneTemp)
	hasLanePattern := false

	for _, cp := range checkpoints {
		// Try to parse name containing _Lane<Num>_Start or _Lane<Num>_End
		if idx := strings.Index(cp.CheckpointName, "_Lane"); idx != -1 {
			rem := cp.CheckpointName[idx+5:] // Skip "_Lane"
			parts := strings.Split(rem, "_")
			if len(parts) >= 1 {
				laneOrder, err := strconv.Atoi(parts[0])
				if err == nil {
					hasLanePattern = true
					if _, exists := lanesMap[laneOrder]; !exists {
						lanesMap[laneOrder] = &LaneTemp{LaneOrder: laneOrder}
					}
					isEnd := false
					if len(parts) >= 2 && strings.ToLower(parts[1]) == "end" {
						isEnd = true
					}
					if isEnd {
						lanesMap[laneOrder].EndCPID = cp.ID
						lanesMap[laneOrder].HasEnd = true
					} else {
						lanesMap[laneOrder].StartCPID = cp.ID
						lanesMap[laneOrder].HasStart = true
					}
				}
			}
		}
	}

	var reportData []LaneReportRow

	if hasLanePattern && len(lanesMap) > 0 {
		// Sort lane keys
		maxLane := 0
		for k := range lanesMap {
			if k > maxLane {
				maxLane = k
			}
		}

		for l := 1; l <= maxLane; l++ {
			lt, exists := lanesMap[l]
			if !exists {
				continue
			}
			row := LaneReportRow{
				LaneName: strconv.Itoa(lt.LaneOrder),
			}
			if lt.HasStart {
				if t, ok := hitTimes[lt.StartCPID]; ok {
					row.StartTime = &t
				}
			}
			if lt.HasEnd {
				if t, ok := hitTimes[lt.EndCPID]; ok {
					row.EndTime = &t
				}
			}
			reportData = append(reportData, row)
		}
	} else {
		// Fallback: list each checkpoint as a separate row
		for _, cp := range checkpoints {
			row := LaneReportRow{
				LaneName: cp.CheckpointName,
			}
			if t, ok := hitTimes[cp.ID]; ok {
				row.StartTime = &t
			}
			reportData = append(reportData, row)
		}
	}

	if reportData == nil {
		reportData = []LaneReportRow{}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    reportData,
	})
}
