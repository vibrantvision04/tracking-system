package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Route struct {
	ID              int       `json:"id"`
	RouteName       string    `json:"route_name"`
	Identification  string    `json:"identification"`
	Distance        float64   `json:"distance"`
	RouteTypeID     int       `json:"route_type_id"`
	GeometryID      int       `json:"geometry_id"`
	IsActive        bool      `json:"is_active"`
	CreatedAt       time.Time `json:"created_at"`
	IsSequential       bool      `json:"is_sequential"`
	CorridorMeters     float64   `json:"corridor_meters"`
	RouteDirection     string    `json:"route_direction"`
	SeqLookahead       int       `json:"seq_lookahead"`
	AggressiveSnapping bool      `json:"aggressive_snapping"`
	AiReconstructionEnabled     bool      `json:"ai_reconstruction_enabled"`
	AiCoverageRecoveryEnabled   bool      `json:"ai_coverage_recovery_enabled"`
	AiPlaybackCorrectionEnabled bool      `json:"ai_playback_correction_enabled"`
	GpsQualityMode              string    `json:"gps_quality_mode"`
	GeoJSON                     string    `json:"geojson,omitempty"`
}

type RouteCheckpoint struct {
	ID            int       `json:"id"`
	RouteID       int       `json:"route_id"`
	CheckpointName string   `json:"checkpoint_name"`
	Latitude      float64   `json:"latitude"`
	Longitude     float64   `json:"longitude"`
	RadiusMeters  float64   `json:"radius_meters"`
	SequenceOrder int       `json:"sequence_order"`
	CreatedAt     time.Time `json:"created_at"`
}

type VehicleRouteAssignment struct {
	ID           int       `json:"id"`
	VehicleID    int       `json:"vehicle_id"`
	RouteID      int       `json:"route_id"`
	ShiftID      int       `json:"shift_id"`
	AssignedDate time.Time `json:"assigned_date"`
	IsActive     bool      `json:"is_active"`
}

type Shift struct {
	ID           int       `json:"id"`
	ShiftName    string    `json:"shift_name"`
	StartTime    string    `json:"start_time"`
	EndTime      string    `json:"end_time"`
	TimeDuration int       `json:"time_duration"`
	IsActive     bool      `json:"is_active"`
	ReportTypeID int       `json:"report_type_id"`
}

type VehicleRouteAssignmentDetail struct {
	ID             int       `json:"id"`
	VehicleID      int       `json:"vehicle_id"`
	VehicleRegNo   string    `json:"vehicle_reg_no"`
	RouteID        int       `json:"route_id"`
	RouteName      string    `json:"route_name"`
	ShiftID        int       `json:"shift_id"`
	ShiftName      string    `json:"shift_name"`
	AssignedDate   string    `json:"assigned_date"`
	IsActive       bool      `json:"is_active"`
}

type RouteCoverageLog struct {
	ID           int64     `json:"id"`
	VehicleID    int       `json:"vehicle_id"`
	RouteID      int       `json:"route_id"`
	CheckpointID int       `json:"checkpoint_id"`
	HitTime      time.Time `json:"hit_time"`
	ReportDate   time.Time `json:"report_date"`
}

type RouteRepository struct {
	db *pgxpool.Pool
}

func NewRouteRepository(db *pgxpool.Pool) *RouteRepository {
	return &RouteRepository{db: db}
}

// Checkpoints
func (r *RouteRepository) AddCheckpoint(ctx context.Context, cp *RouteCheckpoint) error {
	query := `INSERT INTO route_checkpoints (route_id, checkpoint_name, latitude, longitude, radius_meters, sequence_order)
              VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`
	return r.db.QueryRow(ctx, query, cp.RouteID, cp.CheckpointName, cp.Latitude, cp.Longitude, cp.RadiusMeters, cp.SequenceOrder).
		Scan(&cp.ID, &cp.CreatedAt)
}

func (r *RouteRepository) GetCheckpointsByRoute(ctx context.Context, routeID int) ([]RouteCheckpoint, error) {
	query := `SELECT id, route_id, 'Point #' || sequence_number::text as checkpoint_name, latitude, longitude, 10.0 as radius_meters, sequence_number as sequence_order, created_at
              FROM route_lane_points WHERE route_id = $1 ORDER BY sequence_number ASC`
	rows, err := r.db.Query(ctx, query, routeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cps []RouteCheckpoint
	for rows.Next() {
		var cp RouteCheckpoint
		if err := rows.Scan(&cp.ID, &cp.RouteID, &cp.CheckpointName, &cp.Latitude, &cp.Longitude, &cp.RadiusMeters, &cp.SequenceOrder, &cp.CreatedAt); err != nil {
			return nil, err
		}
		cps = append(cps, cp)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return cps, nil
}

// Assignments
func (r *RouteRepository) AssignRoute(ctx context.Context, vehicleID, routeID, shiftID int, date time.Time) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// 1. Check if the route is already assigned to a different vehicle in this shift
	var assignedVehicleRegNo string
	err = tx.QueryRow(ctx, `
		SELECT COALESCE(v.registration_no, '') 
		FROM vehicle_route_assignments va
		JOIN vehicles v ON va.vehicle_id = v.id
		WHERE va.route_id = $1 AND va.shift_id = $2 AND va.is_active = true AND va.vehicle_id != $3 LIMIT 1
	`, routeID, shiftID, vehicleID).Scan(&assignedVehicleRegNo)
	if err == nil {
		return fmt.Errorf("route is already assigned to vehicle %s in this shift", assignedVehicleRegNo)
	} else if err != pgx.ErrNoRows {
		return err
	}

	// 2. Insert or update the assignment using a fixed dummy date '1970-01-01' to enforce persistence
	query := `
		INSERT INTO vehicle_route_assignments (vehicle_id, route_id, shift_id, assigned_date, is_active)
		VALUES ($1, $2, $3, '1970-01-01', true)
		ON CONFLICT (vehicle_id, shift_id, assigned_date)
		DO UPDATE SET route_id = EXCLUDED.route_id, is_active = true, updated_at = NOW()
	`
	_, err = tx.Exec(ctx, query, vehicleID, routeID, shiftID)
	if err != nil {
		return err
	}

	// Sync Route Ward and Zone back to the Vehicle
	var wardID *int
	err = tx.QueryRow(ctx, `SELECT ward_id FROM route_wards WHERE route_id = $1 LIMIT 1`, routeID).Scan(&wardID)
	if err == nil && wardID != nil {
		var zoneID *int
		err = tx.QueryRow(ctx, `SELECT parent_id FROM regions WHERE id = $1`, *wardID).Scan(&zoneID)
		if err == nil && zoneID != nil {
			_, _ = tx.Exec(ctx, `UPDATE vehicles SET ward_id = $1, zone_id = $2 WHERE id = $3`, *wardID, *zoneID, vehicleID)
			
			// Automatically create/update entry inside vehicle-zone mapping (vehicle_regions table)
			_, _ = tx.Exec(ctx, `
				INSERT INTO vehicle_regions (vehicle_id, region_id)
				VALUES ($1, $2)
				ON CONFLICT (vehicle_id) DO UPDATE SET region_id = $2
			`, vehicleID, *zoneID)
		} else {
			_, _ = tx.Exec(ctx, `UPDATE vehicles SET ward_id = $1, zone_id = NULL WHERE id = $2`, *wardID, vehicleID)
		}
	}

	return tx.Commit(ctx)
}

func (r *RouteRepository) GetAssignedRoute(ctx context.Context, vehicleID int, date time.Time, shiftID *int, timeOfDay *string) (*VehicleRouteAssignment, error) {
	dateStr := date.Format("2006-01-02")
	
	// 1. Try to reconstruct from history first
	var routeID int
	var sID int
	var foundHistory bool
	
	historyQuery := `
		SELECT r.id, COALESCE(r.shift_id, 0)
		FROM (
			SELECT route_id FROM route_coverage_logs WHERE vehicle_id = $1 AND report_date = $2
			UNION
			SELECT route_id FROM route_coverage_miss_reasons WHERE vehicle_id = $1 AND report_date = $2
		) h
		JOIN routes r ON h.route_id = r.id
		LEFT JOIN shifts s ON r.shift_id = s.id
		WHERE 1=1
	`
	var histArgs []interface{}
	histArgs = append(histArgs, vehicleID, dateStr)
	
	if shiftID != nil {
		historyQuery += " AND r.shift_id = $3"
		histArgs = append(histArgs, *shiftID)
	} else if timeOfDay != nil {
		historyQuery += ` AND (
			(s.start_time <= s.end_time AND ($3::TIME >= s.start_time AND $3::TIME <= s.end_time))
			OR
			(s.start_time > s.end_time AND ($3::TIME >= s.start_time OR $3::TIME <= s.end_time))
		)`
		histArgs = append(histArgs, *timeOfDay)
	}
	historyQuery += " LIMIT 1"
	
	err := r.db.QueryRow(ctx, historyQuery, histArgs...).Scan(&routeID, &sID)
	if err == nil {
		foundHistory = true
	}
	
	if foundHistory {
		return &VehicleRouteAssignment{
			ID:           0,
			VehicleID:    vehicleID,
			RouteID:      routeID,
			ShiftID:      sID,
			AssignedDate: date,
			IsActive:     true,
		}, nil
	}

	// 2. Otherwise fallback to active assignment
	query := `SELECT va.id, va.vehicle_id, va.route_id, va.shift_id, va.assigned_date, va.is_active
              FROM vehicle_route_assignments va
              JOIN shifts s ON va.shift_id = s.id
              WHERE va.vehicle_id = $1 AND va.is_active = true`
	
	var args []interface{}
	args = append(args, vehicleID)
	
	if shiftID != nil {
		query += " AND va.shift_id = $2"
		args = append(args, *shiftID)
	} else if timeOfDay != nil {
		query += ` AND (
			(s.start_time <= s.end_time AND ($2::TIME >= s.start_time AND $2::TIME <= s.end_time))
			OR
			(s.start_time > s.end_time AND ($2::TIME >= s.start_time OR $2::TIME <= s.end_time))
		)`
		args = append(args, *timeOfDay)
	}
	query += " ORDER BY va.assigned_date DESC LIMIT 1"

	var a VehicleRouteAssignment
	err = r.db.QueryRow(ctx, query, args...).
		Scan(&a.ID, &a.VehicleID, &a.RouteID, &a.ShiftID, &a.AssignedDate, &a.IsActive)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *RouteRepository) GetShifts(ctx context.Context) ([]Shift, error) {
	query := `SELECT id, shift_name, COALESCE(start_time::text, ''), COALESCE(end_time::text, ''), COALESCE(time_duration, 0), is_active, COALESCE(report_type_id, 1) FROM shifts ORDER BY id ASC`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []Shift
	for rows.Next() {
		var s Shift
		if err := rows.Scan(&s.ID, &s.ShiftName, &s.StartTime, &s.EndTime, &s.TimeDuration, &s.IsActive, &s.ReportTypeID); err != nil {
			return nil, err
		}
		list = append(list, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return list, nil
}

func (r *RouteRepository) GetVehicleRouteAssignmentsByDate(ctx context.Context, date time.Time) ([]VehicleRouteAssignmentDetail, error) {
	dateStr := date.Format("2006-01-02")
	query := `
		WITH active_assign AS (
			SELECT vehicle_id, route_id, is_active
			FROM vehicle_route_assignments
			WHERE is_active = true
		),
		historical_assign AS (
			SELECT DISTINCT vehicle_id, route_id
			FROM (
				SELECT vehicle_id, route_id FROM route_coverage_logs WHERE report_date = $1
				UNION
				SELECT vehicle_id, route_id FROM route_coverage_miss_reasons WHERE report_date = $1
			) h
		),
		date_vehicle_assignments AS (
			-- 1. Historical assignments for vehicles that have logs on this date
			SELECT $1::date as report_date, vehicle_id, route_id
			FROM historical_assign
			
			UNION ALL
			
			-- 2. Current active assignments for vehicles that do NOT have logs on this date
			SELECT $1::date as report_date, aa.vehicle_id, aa.route_id
			FROM active_assign aa
			WHERE NOT EXISTS (
				SELECT 1 FROM historical_assign ha 
				WHERE ha.vehicle_id = aa.vehicle_id
			)
		)
		SELECT 
			(ROW_NUMBER() OVER ())::int as id,
			c.vehicle_id,
			COALESCE(v.registration_no, '') as vehicle_reg_no,
			c.route_id,
			COALESCE(r.route_name, '') as route_name,
			COALESCE(s.id, 0) as shift_id,
			COALESCE(s.shift_name, '') as shift_name,
			TO_CHAR(c.report_date, 'YYYY-MM-DD') as assigned_date,
			true as is_active
		FROM date_vehicle_assignments c
		JOIN vehicles v ON c.vehicle_id = v.id
		JOIN routes r ON c.route_id = r.id
		LEFT JOIN shifts s ON r.shift_id = s.id
		ORDER BY vehicle_reg_no ASC, shift_name ASC
	`
	rows, err := r.db.Query(ctx, query, dateStr)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []VehicleRouteAssignmentDetail
	for rows.Next() {
		var d VehicleRouteAssignmentDetail
		if err := rows.Scan(&d.ID, &d.VehicleID, &d.VehicleRegNo, &d.RouteID, &d.RouteName, &d.ShiftID, &d.ShiftName, &d.AssignedDate, &d.IsActive); err != nil {
			return nil, err
		}
		list = append(list, d)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return list, nil
}

func (r *RouteRepository) GetAllVehicleRouteAssignments(ctx context.Context) ([]VehicleRouteAssignmentDetail, error) {
	query := `
		SELECT 
			va.id,
			va.vehicle_id, COALESCE(v.registration_no, '') as vehicle_reg_no,
			va.route_id, COALESCE(r.route_name, '') as route_name,
			va.shift_id, COALESCE(s.shift_name, '') as shift_name,
			TO_CHAR(va.assigned_date, 'YYYY-MM-DD') as assigned_date,
			va.is_active
		FROM vehicle_route_assignments va
		JOIN vehicles v ON va.vehicle_id = v.id
		JOIN routes r ON va.route_id = r.id
		JOIN shifts s ON va.shift_id = s.id
		WHERE va.is_active = true
		ORDER BY v.registration_no ASC, s.id ASC
	`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []VehicleRouteAssignmentDetail
	for rows.Next() {
		var d VehicleRouteAssignmentDetail
		if err := rows.Scan(&d.ID, &d.VehicleID, &d.VehicleRegNo, &d.RouteID, &d.RouteName, &d.ShiftID, &d.ShiftName, &d.AssignedDate, &d.IsActive); err != nil {
			return nil, err
		}
		list = append(list, d)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return list, nil
}

func (r *RouteRepository) DeleteAssignment(ctx context.Context, id int) error {
	query := `DELETE FROM vehicle_route_assignments WHERE id = $1`
	_, err := r.db.Exec(ctx, query, id)
	return err
}

// Coverage Logging
func (r *RouteRepository) LogCheckpointHit(ctx context.Context, vehicleID, routeID, checkpointID int, hitTime time.Time) error {
	query := `
		INSERT INTO route_coverage_logs (vehicle_id, route_id, checkpoint_id, report_date, hit_time)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (vehicle_id, route_id, checkpoint_id, report_date) DO NOTHING
	`
	_, err := r.db.Exec(ctx, query, vehicleID, routeID, checkpointID, hitTime.Format("2006-01-02"), hitTime)
	return err
}

func (r *RouteRepository) GetVisitedCheckpoints(ctx context.Context, vehicleID, routeID int, date time.Time) ([]int, error) {
	query := `SELECT checkpoint_id FROM route_coverage_logs
              WHERE vehicle_id = $1 AND route_id = $2 AND report_date = $3`
	rows, err := r.db.Query(ctx, query, vehicleID, routeID, date.Format("2006-01-02"))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var hits []int
	for rows.Next() {
		var cpID int
		if err := rows.Scan(&cpID); err != nil {
			return nil, err
		}
		hits = append(hits, cpID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return hits, nil
}

type CoverageReportRow struct {
	Date                string  `json:"date"`
	RouteID             int     `json:"route_id"`
	RouteName           string  `json:"route_name"`
	ZoneID              int     `json:"zone_id"`
	ZoneName            string  `json:"zone_name"`
	WardID              int     `json:"ward_id"`
	WardName            string  `json:"ward_name"`
	VehicleID           int     `json:"vehicle_id"`
	VehicleRegNo        string  `json:"vehicle_reg_no"`
	ShiftID             int     `json:"shift_id"`
	RouteTypeID         int     `json:"route_type_id"`
	TotalCheckpoints    int     `json:"total_checkpoints"`
	CoveredPercentage   float64 `json:"covered_percentage"`
	InOrderPercentage   float64 `json:"in_order_percentage"`
	Imei                string  `json:"imei"`
}

func (r *RouteRepository) GetD2DAssignments(ctx context.Context, fromDate, toDate time.Time) ([]CoverageReportRow, error) {
	query := `
		WITH date_range AS (
			SELECT d::date as report_date
			FROM generate_series($1::date, $2::date, '1 day'::interval) d
		),
		active_assign AS (
			SELECT DISTINCT vehicle_id, route_id
			FROM vehicle_route_assignments
			WHERE is_active = true
		),
		historical_assign AS (
			SELECT DISTINCT report_date, vehicle_id, route_id
			FROM (
				SELECT report_date, vehicle_id, route_id FROM route_coverage_logs WHERE report_date >= $1 AND report_date <= $2
				UNION
				SELECT report_date, vehicle_id, route_id FROM route_coverage_miss_reasons WHERE report_date >= $1 AND report_date <= $2
			) h
		),
		date_vehicle_assignments AS (
			-- 1. Historical assignments for vehicles that have logs on each date
			SELECT report_date, vehicle_id, route_id
			FROM historical_assign
			
			UNION ALL
			
			-- 2. Current active assignments for vehicles that do NOT have logs on each date
			SELECT dr.report_date, aa.vehicle_id, aa.route_id
			FROM date_range dr
			CROSS JOIN active_assign aa
			WHERE NOT EXISTS (
				SELECT 1 FROM historical_assign ha 
				WHERE ha.report_date = dr.report_date AND ha.vehicle_id = aa.vehicle_id
			)
		)
		SELECT 
			TO_CHAR(c.report_date, 'YYYY-MM-DD') as date,
			r.id as route_id, COALESCE(r.route_name, ''),
			COALESCE(z.id, 0) as zone_id, COALESCE(z.region_name, ''),
			COALESCE(w.id, 0) as ward_id, COALESCE(w.region_name, ''),
			v.id as vehicle_id, COALESCE(v.registration_no, ''),
			COALESCE(r.shift_id, 0), COALESCE(r.route_type_id, 0),
			COALESCE(d.imei, '') as imei
		FROM date_vehicle_assignments c
		JOIN routes r ON c.route_id = r.id
		JOIN vehicles v ON c.vehicle_id = v.id
		LEFT JOIN LATERAL (SELECT ward_id FROM route_wards WHERE route_id = r.id LIMIT 1) rw ON true
		LEFT JOIN regions w ON rw.ward_id = w.id
		LEFT JOIN vehicle_regions vr ON v.id = vr.vehicle_id
		LEFT JOIN regions z ON COALESCE(vr.region_id, v.zone_id) = z.id
		LEFT JOIN LATERAL (
			SELECT device_id FROM vehicle_gps_map 
			WHERE vehicle_id = v.id AND unassigned_at IS NULL 
			ORDER BY assigned_at DESC LIMIT 1
		) m ON true
		LEFT JOIN gps_devices d ON m.device_id = d.id
		ORDER BY c.report_date DESC, r.route_name ASC
	`
	rows, err := r.db.Query(ctx, query, fromDate.Format("2006-01-02"), toDate.Format("2006-01-02"))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []CoverageReportRow
	for rows.Next() {
		var row CoverageReportRow
		if err := rows.Scan(
			&row.Date,
			&row.RouteID, &row.RouteName,
			&row.ZoneID, &row.ZoneName,
			&row.WardID, &row.WardName,
			&row.VehicleID, &row.VehicleRegNo,
			&row.ShiftID, &row.RouteTypeID,
			&row.Imei,
		); err != nil {
			return nil, err
		}
		results = append(results, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return results, nil
}

type CheckpointHitLog struct {
	CheckpointID  int
	SequenceOrder int
	HitTime       time.Time
}

// lanePointSequenceMap returns a map from lane_point_id → sequence_number for
// the given route. This is the authoritative route order used by the in-order
// coverage logic.
func (r *RouteRepository) lanePointSequenceMap(ctx context.Context, routeID int) (map[int]int, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, sequence_number FROM route_lane_points
		WHERE route_id = $1
	`, routeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	m := make(map[int]int)
	for rows.Next() {
		var id, seq int
		if err := rows.Scan(&id, &seq); err == nil {
			m[id] = seq
		}
	}
	return m, rows.Err()
}

// GetLanePointCountsByRoutes returns a map of routeID -> lane point count for the
// given routes in a single query. Used by the D2D report to avoid an N+1
// GetCheckpointsByRoute call per (vehicle, route, date) row.
func (r *RouteRepository) GetLanePointCountsByRoutes(ctx context.Context, routeIDs []int) (map[int]int, error) {
	counts := make(map[int]int)
	if len(routeIDs) == 0 {
		return counts, nil
	}
	rows, err := r.db.Query(ctx, `
		SELECT route_id, COUNT(*)
		FROM route_lane_points
		WHERE route_id = ANY($1)
		GROUP BY route_id
	`, routeIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var routeID, cnt int
		if err := rows.Scan(&routeID, &cnt); err != nil {
			return nil, err
		}
		counts[routeID] = cnt
	}
	return counts, rows.Err()
}

// CoverageRangeKey builds the map key used by GetCoverageHitLogsForRange.
func CoverageRangeKey(vehicleID, routeID int, date string) string {
	return fmt.Sprintf("%d|%d|%s", vehicleID, routeID, date)
}

// GetCoverageHitLogsForRange batch-loads achieved coverage hit logs for every
// (vehicle, route, date) in the date range in a single query, keyed by
// coverageRangeKey. This replaces the per-row GetCoverageHitLogs query in the D2D
// report for the common case where coverage is already computed. Parsing matches
// GetCoverageHitLogs exactly so computed percentages are identical.
func (r *RouteRepository) GetCoverageHitLogsForRange(ctx context.Context, fromDate, toDate string) (map[string][]CheckpointHitLog, error) {
	result := make(map[string][]CheckpointHitLog)
	rows, err := r.db.Query(ctx, `
		SELECT vehicle_id, route_id, TO_CHAR(report_date, 'YYYY-MM-DD'), details
		FROM vehicle_lane_point_coverage
		WHERE report_date >= $1 AND report_date <= $2
	`, fromDate, toDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type Detail struct {
		LanePointID int        `json:"lane_point_id"`
		Status      string     `json:"status"`
		HitTime     *time.Time `json:"hit_time"`
	}

	// Cache sequence maps per route to avoid repeated queries.
	seqCache := make(map[int]map[int]int)

	for rows.Next() {
		var vehicleID, routeID int
		var date string
		var detailsJSON []byte
		if err := rows.Scan(&vehicleID, &routeID, &date, &detailsJSON); err != nil {
			return nil, err
		}

		var details []Detail
		if len(detailsJSON) > 0 {
			if err := json.Unmarshal(detailsJSON, &details); err != nil {
				continue
			}
		}

		// Get or cache the sequence map for this route.
		seqMap, cached := seqCache[routeID]
		if !cached {
			seqMap, _ = r.lanePointSequenceMap(ctx, routeID)
			seqCache[routeID] = seqMap // may be nil
		}

		var logs []CheckpointHitLog
		for _, d := range details {
			if d.Status == "achieved" && d.HitTime != nil {
				seq := d.LanePointID // fallback
				if seqMap != nil {
					if s, ok := seqMap[d.LanePointID]; ok {
						seq = s
					}
				}
				logs = append(logs, CheckpointHitLog{
					CheckpointID:  d.LanePointID,
					SequenceOrder: seq,
					HitTime:       *d.HitTime,
				})
			}
		}
		// Sort by hit_time for correct in-order evaluation.
		sort.Slice(logs, func(i, j int) bool {
			return logs[i].HitTime.Before(logs[j].HitTime)
		})
		result[CoverageRangeKey(vehicleID, routeID, date)] = logs
	}
	return result, rows.Err()
}

func (r *RouteRepository) GetCoverageHitLogs(ctx context.Context, vehicleID, routeID int, date string) ([]CheckpointHitLog, error) {
	var detailsJSON []byte
	err := r.db.QueryRow(ctx, `
		SELECT details
		FROM vehicle_lane_point_coverage
		WHERE vehicle_id = $1 AND route_id = $2 AND report_date = $3
	`, vehicleID, routeID, date).Scan(&detailsJSON)

	if err != nil {
		if err == pgx.ErrNoRows {
			return []CheckpointHitLog{}, nil
		}
		return nil, err
	}

	type Detail struct {
		LanePointID int        `json:"lane_point_id"`
		Status      string     `json:"status"`
		HitTime     *time.Time `json:"hit_time"`
	}

	var details []Detail
	if err := json.Unmarshal(detailsJSON, &details); err != nil {
		return nil, err
	}

	// Build a lookup map from lane_point_id → sequence_number so the in-order
	// logic can use the real route sequence rather than the database row ID.
	seqMap, err := r.lanePointSequenceMap(ctx, routeID)
	if err != nil {
		// Fallback: use lane_point_id as before if we can't get sequence numbers
		seqMap = nil
	}

	var logs []CheckpointHitLog
	for _, d := range details {
		if d.Status == "achieved" && d.HitTime != nil {
			seq := d.LanePointID // fallback
			if seqMap != nil {
				if s, ok := seqMap[d.LanePointID]; ok {
					seq = s
				}
			}
			logs = append(logs, CheckpointHitLog{
				CheckpointID:  d.LanePointID,
				SequenceOrder: seq,
				HitTime:       *d.HitTime,
			})
		}
	}

	// Sort by hit_time so in-order logic checks temporal sequence.
	sort.Slice(logs, func(i, j int) bool {
		return logs[i].HitTime.Before(logs[j].HitTime)
	})

	return logs, nil
}

type DashboardCoverageData struct {
	TotalCheckpoints  int
	CoveredCheckpoints int
	InOrderHits       int
}

// GetDashboardCoverageData returns a map of VehicleID -> DashboardCoverageData for a given date
func (r *RouteRepository) GetDashboardCoverageData(ctx context.Context, date string) (map[int]DashboardCoverageData, error) {
	// Query vehicle_lane_point_coverage which already has the pre-calculated coverage details
	query := `
		SELECT vehicle_id, total_points, covered_points, in_order
		FROM vehicle_lane_point_coverage
		WHERE report_date = $1
	`
	rows, err := r.db.Query(ctx, query, date)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	data := make(map[int]DashboardCoverageData)

	for rows.Next() {
		var vID, total, covered int
		var inOrder bool
		if err := rows.Scan(&vID, &total, &covered, &inOrder); err != nil {
			continue
		}
		
		inOrderHits := 0
		if inOrder {
			inOrderHits = covered 
		}

		data[vID] = DashboardCoverageData{
			TotalCheckpoints:   total,
			CoveredCheckpoints: covered,
			InOrderHits:        inOrderHits,
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return data, nil
}

func (r *RouteRepository) HasCoverageRecords(ctx context.Context, vehicleID, routeID int, date string) (bool, error) {
	query := `
		SELECT EXISTS (
			SELECT 1 FROM route_coverage_logs WHERE vehicle_id = $1 AND route_id = $2 AND report_date = $3
			UNION ALL
			SELECT 1 FROM route_coverage_miss_reasons WHERE vehicle_id = $1 AND route_id = $2 AND report_date = $3
		)
	`
	var exists bool
	err := r.db.QueryRow(ctx, query, vehicleID, routeID, date).Scan(&exists)
	return exists, err
}

// InvalidateRouteCoverage deletes all stored coverage for a route across both the
// SSOT (vehicle_lane_point_coverage) and the legacy tables. It is called when a
// route's geometry/lane points change, because the stored coverage references the
// old lane-point IDs and would otherwise show stale/zero values. Coverage is
// derived data and is fully recomputed from raw GPS on the next report Load, so
// this is safe and reversible. It does NOT change any calculation logic.
func (r *RouteRepository) InvalidateRouteCoverage(ctx context.Context, routeID int) error {
	stmts := []string{
		"DELETE FROM vehicle_lane_point_coverage WHERE route_id = $1",
		"DELETE FROM vehicle_lane_point_logs WHERE route_id = $1",
		"DELETE FROM route_coverage_logs WHERE route_id = $1",
		"DELETE FROM route_coverage_miss_reasons WHERE route_id = $1",
	}
	for _, q := range stmts {
		if _, err := r.db.Exec(ctx, q, routeID); err != nil {
			return err
		}
	}
	return nil
}

// HasLanePointCoverage reports whether a coverage row exists in the single source
// of truth (vehicle_lane_point_coverage) for the given vehicle, route, and date.
// This is the SSOT-aware "has history" check used by reports that read coverage
// from vehicle_lane_point_coverage (D2D, Shift-Based Ops).
func (r *RouteRepository) HasLanePointCoverage(ctx context.Context, vehicleID, routeID int, date string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM vehicle_lane_point_coverage
			WHERE vehicle_id = $1 AND route_id = $2 AND report_date = $3
		)
	`, vehicleID, routeID, date).Scan(&exists)
	return exists, err
}

type RouteLanePoint struct {
	ID             int       `json:"id"`
	RouteID        int       `json:"route_id"`
	Latitude       float64   `json:"latitude"`
	Longitude      float64   `json:"longitude"`
	SequenceNumber int       `json:"sequence_number"`
	CreatedAt      time.Time `json:"created_at"`
}

func (r *RouteRepository) GetLanePointsByRoute(ctx context.Context, routeID int) ([]RouteLanePoint, error) {
	query := `SELECT id, route_id, latitude, longitude, sequence_number, created_at
              FROM route_lane_points WHERE route_id = $1 ORDER BY sequence_number ASC`
	rows, err := r.db.Query(ctx, query, routeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []RouteLanePoint
	for rows.Next() {
		var p RouteLanePoint
		if err := rows.Scan(&p.ID, &p.RouteID, &p.Latitude, &p.Longitude, &p.SequenceNumber, &p.CreatedAt); err != nil {
			return nil, err
		}
		points = append(points, p)
	}
	return points, rows.Err()
}

type VehicleLanePointLog struct {
	VehicleID         int
	RouteID           int
	LanePointID       int
	ReportDate        string
	Status            string
	HitTime           *time.Time
	ViolationOccurred bool
	CompletedAt       *time.Time
}

func (r *RouteRepository) UpsertVehicleLanePointLogs(ctx context.Context, logs []VehicleLanePointLog) error {
	if len(logs) == 0 {
		return nil
	}

	vehicleID := logs[0].VehicleID
	routeID := logs[0].RouteID
	reportDate := logs[0].ReportDate

	type Detail struct {
		LanePointID int        `json:"lane_point_id"`
		Status      string     `json:"status"`
		HitTime     *time.Time `json:"hit_time"`
	}

	var details []Detail
	coveredPoints := 0
	violationOccurred := false
	var completedAt *time.Time

	for _, log := range logs {
		details = append(details, Detail{
			LanePointID: log.LanePointID,
			Status:      log.Status,
			HitTime:     log.HitTime,
		})
		if log.Status == "achieved" {
			coveredPoints++
		}
		if log.ViolationOccurred {
			violationOccurred = true
		}
		if log.CompletedAt != nil {
			completedAt = log.CompletedAt
		}
	}

	totalPoints := len(logs)
	var coveragePercent float64
	if totalPoints > 0 {
		coveragePercent = float64(coveredPoints) * 100.0 / float64(totalPoints)
	}

	inOrder := !violationOccurred

	detailsJSON, err := json.Marshal(details)
	if err != nil {
		return err
	}

	query := `
		INSERT INTO vehicle_lane_point_coverage 
		(vehicle_id, route_id, report_date, total_points, covered_points, coverage_percent, in_order, violation_occurred, details, completed_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		ON CONFLICT (vehicle_id, route_id, report_date)
		DO UPDATE SET
			total_points = EXCLUDED.total_points,
			covered_points = EXCLUDED.covered_points,
			coverage_percent = EXCLUDED.coverage_percent,
			in_order = EXCLUDED.in_order,
			violation_occurred = EXCLUDED.violation_occurred,
			details = EXCLUDED.details,
			completed_at = EXCLUDED.completed_at
	`
	_, err = r.db.Exec(ctx, query, vehicleID, routeID, reportDate, totalPoints, coveredPoints, coveragePercent, inOrder, violationOccurred, detailsJSON, completedAt)
	return err
}

func (r *RouteRepository) GetVehicleLanePointLogs(ctx context.Context, vehicleID, routeID int, date string) ([]VehicleLanePointLog, error) {
	var detailsJSON []byte
	var violationOccurred bool
	var completedAt *time.Time
	
	err := r.db.QueryRow(ctx, `
		SELECT details, violation_occurred, completed_at
		FROM vehicle_lane_point_coverage
		WHERE vehicle_id = $1 AND route_id = $2 AND report_date = $3
	`, vehicleID, routeID, date).Scan(&detailsJSON, &violationOccurred, &completedAt)

	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	type Detail struct {
		LanePointID int        `json:"lane_point_id"`
		Status      string     `json:"status"`
		HitTime     *time.Time `json:"hit_time"`
	}

	var details []Detail
	if err := json.Unmarshal(detailsJSON, &details); err != nil {
		return nil, err
	}

	var logs []VehicleLanePointLog
	for _, d := range details {
		logs = append(logs, VehicleLanePointLog{
			VehicleID:         vehicleID,
			RouteID:           routeID,
			LanePointID:       d.LanePointID,
			ReportDate:        date,
			Status:            d.Status,
			HitTime:           d.HitTime,
			ViolationOccurred: violationOccurred,
			CompletedAt:       completedAt,
		})
	}
	return logs, nil
}

type VehicleRouteReconstruction struct {
	ID                 int64       `json:"id"`
	VehicleID          int         `json:"vehicle_id"`
	RouteID            int         `json:"route_id"`
	ReportDate         time.Time   `json:"report_date"`
	RawGpsCount        int         `json:"raw_gps_count"`
	CorrectedGpsCount  int         `json:"corrected_gps_count"`
	AverageConfidence  float64     `json:"average_confidence"`
	ReconstructedPath  string      `json:"reconstructed_path"`
	CreatedAt          time.Time   `json:"created_at"`
}

func (r *RouteRepository) SaveRouteReconstruction(ctx context.Context, vr *VehicleRouteReconstruction) error {
	query := `
		INSERT INTO vehicle_route_reconstructions 
		(vehicle_id, route_id, report_date, raw_gps_count, corrected_gps_count, average_confidence, reconstructed_path)
		VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
		ON CONFLICT (vehicle_id, route_id, report_date)
		DO UPDATE SET
			raw_gps_count = EXCLUDED.raw_gps_count,
			corrected_gps_count = EXCLUDED.corrected_gps_count,
			average_confidence = EXCLUDED.average_confidence,
			reconstructed_path = EXCLUDED.reconstructed_path,
			created_at = NOW()
	`
	_, err := r.db.Exec(ctx, query, vr.VehicleID, vr.RouteID, vr.ReportDate.Format("2006-01-02"), vr.RawGpsCount, vr.CorrectedGpsCount, vr.AverageConfidence, vr.ReconstructedPath)
	return err
}

func (r *RouteRepository) GetRouteReconstruction(ctx context.Context, vehicleID, routeID int, date string) (*VehicleRouteReconstruction, error) {
	query := `
		SELECT id, vehicle_id, route_id, report_date, raw_gps_count, corrected_gps_count, average_confidence, reconstructed_path::text, created_at
		FROM vehicle_route_reconstructions
		WHERE vehicle_id = $1 AND route_id = $2 AND report_date = $3
	`
	var vr VehicleRouteReconstruction
	err := r.db.QueryRow(ctx, query, vehicleID, routeID, date).Scan(
		&vr.ID, &vr.VehicleID, &vr.RouteID, &vr.ReportDate, &vr.RawGpsCount, &vr.CorrectedGpsCount, &vr.AverageConfidence, &vr.ReconstructedPath, &vr.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &vr, nil
}

func (r *RouteRepository) GetRouteByID(ctx context.Context, id int) (*Route, error) {
	query := `
		SELECT 
			r.id, 
			COALESCE(r.route_name, ''), 
			COALESCE(r.identification, ''), 
			COALESCE(r.distance, 0.0), 
			COALESCE(r.route_type_id, 1), 
			COALESCE(r.geometry_id, 0), 
			COALESCE(r.is_active, true),
			COALESCE(r.created_at, NOW()),
			COALESCE(r.is_sequential, false),
			COALESCE(r.corridor_meters, 50.0),
			COALESCE(r.route_direction, 'both'),
			COALESCE(r.seq_lookahead, 5),
			COALESCE(r.aggressive_snapping, false),
			COALESCE(r.ai_reconstruction_enabled, false),
			COALESCE(r.ai_coverage_recovery_enabled, false),
			COALESCE(r.ai_playback_correction_enabled, false),
			COALESCE(r.gps_quality_mode, 'normal'),
			COALESCE(g.polygon::text, '')
		FROM routes r
		LEFT JOIN geofences g ON r.geometry_id = g.id
		WHERE r.id = $1
	`
	var route Route
	err := r.db.QueryRow(ctx, query, id).Scan(
		&route.ID, &route.RouteName, &route.Identification, &route.Distance, &route.RouteTypeID,
		&route.GeometryID, &route.IsActive, &route.CreatedAt,
		&route.IsSequential, &route.CorridorMeters, &route.RouteDirection, &route.SeqLookahead, &route.AggressiveSnapping,
		&route.AiReconstructionEnabled, &route.AiCoverageRecoveryEnabled, &route.AiPlaybackCorrectionEnabled, &route.GpsQualityMode,
		&route.GeoJSON,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &route, nil
}


