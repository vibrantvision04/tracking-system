package repository

import (
	"context"
	"time"

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
	AssignedDate time.Time `json:"assigned_date"`
	IsActive     bool      `json:"is_active"`
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
func (r *RouteRepository) AssignRoute(ctx context.Context, vehicleID, routeID int, date time.Time) error {
	query := `
		INSERT INTO vehicle_route_assignments (vehicle_id, route_id, assigned_date, is_active)
		VALUES ($1, $2, $3, true)
		ON CONFLICT (vehicle_id, assigned_date)
		DO UPDATE SET route_id = EXCLUDED.route_id, is_active = true, updated_at = NOW()
	`
	_, err := r.db.Exec(ctx, query, vehicleID, routeID, date.Format("2006-01-02"))
	return err
}

func (r *RouteRepository) GetAssignedRoute(ctx context.Context, vehicleID int, date time.Time) (*VehicleRouteAssignment, error) {
	query := `SELECT id, vehicle_id, route_id, assigned_date, is_active
              FROM vehicle_route_assignments
              WHERE vehicle_id = $1 AND assigned_date = $2 AND is_active = true`
	var a VehicleRouteAssignment
	err := r.db.QueryRow(ctx, query, vehicleID, date.Format("2006-01-02")).
		Scan(&a.ID, &a.VehicleID, &a.RouteID, &a.AssignedDate, &a.IsActive)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// Coverage Logging
func (r *RouteRepository) LogCheckpointHit(ctx context.Context, vehicleID, routeID, checkpointID int, date time.Time) error {
	query := `
		INSERT INTO route_coverage_logs (vehicle_id, route_id, checkpoint_id, report_date, hit_time)
		VALUES ($1, $2, $3, $4, NOW())
		ON CONFLICT (vehicle_id, route_id, checkpoint_id, report_date) DO NOTHING
	`
	_, err := r.db.Exec(ctx, query, vehicleID, routeID, checkpointID, date.Format("2006-01-02"))
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
		SELECT 
			TO_CHAR(va.assigned_date, 'YYYY-MM-DD') as date,
			r.id as route_id, COALESCE(r.route_name, ''),
			COALESCE(z.id, 0) as zone_id, COALESCE(z.region_name, ''),
			COALESCE(w.id, 0) as ward_id, COALESCE(w.region_name, ''),
			v.id as vehicle_id, COALESCE(v.registration_no, ''),
			COALESCE(r.shift_id, 0), COALESCE(r.route_type_id, 0),
			COALESCE(d.imei, '') as imei
		FROM vehicle_route_assignments va
		JOIN routes r ON va.route_id = r.id
		JOIN vehicles v ON va.vehicle_id = v.id
		LEFT JOIN regions w ON r.ward_id = w.id
		LEFT JOIN regions z ON w.parent_id = z.id
		LEFT JOIN vehicle_gps_map m ON v.id = m.vehicle_id AND m.unassigned_at IS NULL
		LEFT JOIN gps_devices d ON m.device_id = d.id
		WHERE va.assigned_date >= $1 AND va.assigned_date <= $2 AND va.is_active = true
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

