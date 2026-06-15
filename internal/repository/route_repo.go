package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Route struct {
	ID             int       `json:"id"`
	RouteName      string    `json:"route_name"`
	Identification string    `json:"identification"`
	Distance       float64   `json:"distance"`
	RouteTypeID    int       `json:"route_type_id"`
	GeometryID     int       `json:"geometry_id"`
	IsActive       bool      `json:"is_active"`
	CreatedAt      time.Time `json:"created_at"`
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
	query := `SELECT id, route_id, checkpoint_name, latitude, longitude, radius_meters, sequence_order, created_at
              FROM route_checkpoints WHERE route_id = $1 ORDER BY sequence_order ASC`
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
	query := `SELECT id, shift_name, COALESCE(start_time::text, ''), COALESCE(end_time::text, ''), COALESCE(time_duration, 0), is_active FROM shifts ORDER BY id ASC`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []Shift
	for rows.Next() {
		var s Shift
		if err := rows.Scan(&s.ID, &s.ShiftName, &s.StartTime, &s.EndTime, &s.TimeDuration, &s.IsActive); err != nil {
			return nil, err
		}
		list = append(list, s)
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
	return results, nil
}

type CheckpointHitLog struct {
	CheckpointID  int
	SequenceOrder int
	HitTime       time.Time
}

func (r *RouteRepository) GetCoverageHitLogs(ctx context.Context, vehicleID, routeID int, date string) ([]CheckpointHitLog, error) {
	query := `
		SELECT l.checkpoint_id, c.sequence_order, l.hit_time
		FROM route_coverage_logs l
		JOIN route_checkpoints c ON l.checkpoint_id = c.id
		WHERE l.vehicle_id = $1 AND l.route_id = $2 AND l.report_date = $3
		ORDER BY l.hit_time ASC
	`
	rows, err := r.db.Query(ctx, query, vehicleID, routeID, date)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []CheckpointHitLog
	for rows.Next() {
		var log CheckpointHitLog
		if err := rows.Scan(&log.CheckpointID, &log.SequenceOrder, &log.HitTime); err != nil {
			return nil, err
		}
		logs = append(logs, log)
	}
	return logs, nil
}

type DashboardCoverageData struct {
	TotalCheckpoints  int
	CoveredCheckpoints int
	InOrderHits       int
}

// GetDashboardCoverageData returns a map of VehicleID -> DashboardCoverageData for a given date
func (r *RouteRepository) GetDashboardCoverageData(ctx context.Context, date string) (map[int]DashboardCoverageData, error) {
	// First get the active assignments and total checkpoints for each vehicle
	queryAssignments := `
		SELECT va.vehicle_id, r.id, COUNT(rc.id) as total_checkpoints
		FROM (
			SELECT DISTINCT ON (vehicle_id) vehicle_id, route_id
			FROM vehicle_route_assignments
			WHERE is_active = true
			ORDER BY vehicle_id, assigned_date DESC, id DESC
		) va
		JOIN routes r ON va.route_id = r.id
		LEFT JOIN route_checkpoints rc ON r.id = rc.route_id
		GROUP BY va.vehicle_id, r.id
	`
	rows, err := r.db.Query(ctx, queryAssignments)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	data := make(map[int]DashboardCoverageData)
	vehicleRoutes := make(map[int]int)

	for rows.Next() {
		var vID, rID, total int
		if err := rows.Scan(&vID, &rID, &total); err != nil {
			continue
		}
		data[vID] = DashboardCoverageData{TotalCheckpoints: total}
		vehicleRoutes[vID] = rID
	}

	// Then get all hit logs for the date
	queryLogs := `
		SELECT l.vehicle_id, l.checkpoint_id, c.sequence_order, l.hit_time
		FROM route_coverage_logs l
		JOIN route_checkpoints c ON l.checkpoint_id = c.id
		WHERE l.report_date = $1
		ORDER BY l.vehicle_id, l.hit_time ASC
	`
	logsRows, err := r.db.Query(ctx, queryLogs, date)
	if err != nil {
		return data, nil // Return what we have so far
	}
	defer logsRows.Close()

	// vehicleID -> unique hits map
	hits := make(map[int]map[int]bool)
	// vehicleID -> in-order calculation state
	lastSeq := make(map[int]int)
	inOrder := make(map[int]int)

	for logsRows.Next() {
		var vID, cpID, seqOrder int
		var hitTime time.Time
		if err := logsRows.Scan(&vID, &cpID, &seqOrder, &hitTime); err != nil {
			continue
		}

		if hits[vID] == nil {
			hits[vID] = make(map[int]bool)
			lastSeq[vID] = -1
		}

		hits[vID][cpID] = true
		if seqOrder > lastSeq[vID] {
			inOrder[vID]++
			lastSeq[vID] = seqOrder
		}
	}

	// Update data map with calculated percentages
	for vID, d := range data {
		covered := len(hits[vID])
		inOrderHits := inOrder[vID]

		if inOrderHits > d.TotalCheckpoints {
			inOrderHits = d.TotalCheckpoints
		}

		d.CoveredCheckpoints = covered
		d.InOrderHits = inOrderHits
		data[vID] = d
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

