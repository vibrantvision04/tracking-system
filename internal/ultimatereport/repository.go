package ultimatereport

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"gps-tracking-system/internal/utils"
)

// ─────────────────────────────────────────────────────────────────────────────
// Internal query result types
// ─────────────────────────────────────────────────────────────────────────────

// MovementRow holds raw movement_reports data for a single vehicle on a date.
type MovementRow struct {
	VehicleID      int
	RegistrationNo string
	ZoneName       string
	WardName       string
	StartTime      *time.Time
	EndTime        *time.Time
	ActiveHours    string  // "HH:MM:SS"
	TotalDistance  float64
	AverageSpeed   float64
}

// FleetMasterRow holds the fleet zone/type mapping.
type FleetMasterRow struct {
	VehicleRegNo string
	VehicleType  string
	AssignedZone string // "HMZ"|"CLZ"|"KPZ"|"ANZ"|"SW"
	AssignedWard string
	IsActive     bool
}

// ExceptionRow holds a daily exception override.
type ExceptionRow struct {
	VehicleRegNo       string `json:"vehicle_reg_no"`
	ExceptionType      string `json:"exception_type"`
	ReplacementVehicle string `json:"replacement_vehicle"`
	Remarks            string `json:"remarks"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Repository
// ─────────────────────────────────────────────────────────────────────────────

// UltimateReportRepository queries only existing tables — no new telemetry storage.
type UltimateReportRepository struct {
	pool *pgxpool.Pool
}

func NewUltimateReportRepository(pool *pgxpool.Pool) *UltimateReportRepository {
	return &UltimateReportRepository{pool: pool}
}

// GetMovementData returns all vehicles that have movement_reports data for the given date.
// Zone and ward are resolved from vehicle_regions / route_wards (same logic as report_service.go).
func (r *UltimateReportRepository) GetMovementData(ctx context.Context, date time.Time) ([]MovementRow, error) {
	dateStr := date.Format("2006-01-02")
	query := `
		SELECT
			mr.vehicle_id,
			COALESCE(v.registration_no, '') AS registration_no,
			COALESCE(z.region_name, mr.zone, '') AS zone_name,
			COALESCE(w.region_name, mr.ward, '') AS ward_name,
			mr.start_time,
			mr.end_time,
			COALESCE(mr.total_active_duration, '00:00:00') AS active_hours,
			COALESCE(mr.total_distance, 0.0)               AS total_distance,
			COALESCE(mr.average_speed, 0.0)                AS average_speed
		FROM movement_reports mr
		JOIN vehicles v ON mr.vehicle_id = v.id
		-- Resolve zone from vehicle_regions (primary) or vehicles.zone_id (fallback)
		LEFT JOIN vehicle_regions  vr ON v.id = vr.vehicle_id
		LEFT JOIN regions          z  ON COALESCE(vr.region_id, v.zone_id) = z.id AND z.region_type_id = 2
		-- Resolve ward from route_wards → active assignment (primary) or vehicles.ward_id (fallback)
		LEFT JOIN LATERAL (
			SELECT route_id FROM vehicle_route_assignments
			WHERE vehicle_id = v.id AND is_active = true
			ORDER BY assigned_date DESC, id DESC
			LIMIT 1
		) vra ON true
		LEFT JOIN LATERAL (
			SELECT ward_id FROM route_wards WHERE route_id = vra.route_id LIMIT 1
		) rw ON true
		LEFT JOIN regions w ON COALESCE(rw.ward_id, v.ward_id) = w.id AND w.region_type_id = 3
		WHERE mr.report_date = $1
		ORDER BY z.region_name, w.region_name, v.registration_no
	`

	rows, err := r.pool.Query(ctx, query, dateStr)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []MovementRow
	for rows.Next() {
		var m MovementRow
		err := rows.Scan(
			&m.VehicleID, &m.RegistrationNo, &m.ZoneName, &m.WardName,
			&m.StartTime, &m.EndTime, &m.ActiveHours,
			&m.TotalDistance, &m.AverageSpeed,
		)
		if err != nil {
			return nil, err
		}
		results = append(results, m)
	}
	return results, nil
}

// GetCoveragePercent returns a map of vehicle_reg_no → coverage percentage (0–100)
// for the given date, calculated from vehicle_lane_point_coverage.
func (r *UltimateReportRepository) GetCoveragePercent(ctx context.Context, date time.Time) (map[string]float64, error) {
	dateStr := date.Format("2006-01-02")
	query := `
		SELECT
			v.registration_no,
			COALESCE(c.coverage_percent, 0.0) AS coverage_pct
		FROM vehicle_lane_point_coverage c
		JOIN vehicles v ON c.vehicle_id = v.id
		WHERE c.report_date = $1
	`
	rows, err := r.pool.Query(ctx, query, dateStr)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]float64)
	for rows.Next() {
		var regNo string
		var pct float64
		if err := rows.Scan(&regNo, &pct); err != nil {
			return nil, err
		}
		result[regNo] = pct
	}
	return result, nil
}

// GetFleetMaster returns all active rows from fleet_master.
func (r *UltimateReportRepository) GetFleetMaster(ctx context.Context) ([]FleetMasterRow, error) {
	query := `
		SELECT vehicle_reg_no, COALESCE(vehicle_type, ''), assigned_zone, COALESCE(assigned_ward, ''), is_active
		FROM fleet_master
		ORDER BY assigned_zone, vehicle_reg_no
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return r.getFleetMasterFallback(ctx)
	}
	defer rows.Close()

	var results []FleetMasterRow
	for rows.Next() {
		var f FleetMasterRow
		if err := rows.Scan(&f.VehicleRegNo, &f.VehicleType, &f.AssignedZone, &f.AssignedWard, &f.IsActive); err != nil {
			return nil, err
		}
		results = append(results, f)
	}

	if len(results) == 0 {
		return r.getFleetMasterFallback(ctx)
	}

	return results, nil
}

func (r *UltimateReportRepository) getFleetMasterFallback(ctx context.Context) ([]FleetMasterRow, error) {
	query := `
		SELECT 
			v.registration_no,
			COALESCE(vt.vehicle_type_name, '') as vehicle_type,
			COALESCE(z.region_name, '') as assigned_zone,
			COALESCE(w.region_name, '') as assigned_ward,
			v.is_active
		FROM vehicles v
		LEFT JOIN vehicle_types_swift vt ON v.vehicle_type_id = vt.id
		LEFT JOIN vehicle_regions vr ON v.id = vr.vehicle_id
		LEFT JOIN regions z ON COALESCE(vr.region_id, v.zone_id) = z.id AND z.region_type_id = 2
		LEFT JOIN LATERAL (
			SELECT route_id FROM vehicle_route_assignments
			WHERE vehicle_id = v.id AND is_active = true
			ORDER BY assigned_date DESC, id DESC
			LIMIT 1
		) vra ON true
		LEFT JOIN LATERAL (
			SELECT ward_id FROM route_wards WHERE route_id = vra.route_id LIMIT 1
		) rw ON true
		LEFT JOIN regions w ON COALESCE(rw.ward_id, v.ward_id) = w.id AND w.region_type_id = 3
		WHERE v.is_active = true
		ORDER BY assigned_zone, v.registration_no
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []FleetMasterRow
	for rows.Next() {
		var f FleetMasterRow
		if err := rows.Scan(&f.VehicleRegNo, &f.VehicleType, &f.AssignedZone, &f.AssignedWard, &f.IsActive); err != nil {
			return nil, err
		}
		results = append(results, f)
	}
	return results, nil
}

// GetExceptions returns daily_exceptions for the given date as a map of reg_no → ExceptionRow.
func (r *UltimateReportRepository) GetExceptions(ctx context.Context, date time.Time) (map[string]ExceptionRow, error) {
	dateStr := date.Format("2006-01-02")
	query := `
		SELECT vehicle_reg_no, exception_type::text, COALESCE(replacement_vehicle, ''), COALESCE(remarks, '')
		FROM daily_exceptions
		WHERE report_date = $1
	`
	rows, err := r.pool.Query(ctx, query, dateStr)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]ExceptionRow)
	for rows.Next() {
		var e ExceptionRow
		if err := rows.Scan(&e.VehicleRegNo, &e.ExceptionType, &e.ReplacementVehicle, &e.Remarks); err != nil {
			return nil, err
		}
		result[e.VehicleRegNo] = e
	}
	return result, nil
}

// GetTripCounts returns the number of completed trips per vehicle registration number
// for the given date, sourced from the existing trips table.
func (r *UltimateReportRepository) GetTripCounts(ctx context.Context, date time.Time) (map[string]int, error) {
	// trips.start_time is in UTC; convert date to IST window for query
	dayStart := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, utils.IndianLocation)
	dayEnd := dayStart.Add(24 * time.Hour)

	query := `
		SELECT v.registration_no, COUNT(t.id)::int AS trip_count
		FROM trips t
		JOIN vehicles v ON t.vehicle_id = v.id
		WHERE t.start_time >= $1 AND t.start_time < $2
		  AND t.end_time IS NOT NULL
		GROUP BY v.registration_no
	`
	rows, err := r.pool.Query(ctx, query, dayStart, dayEnd)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]int)
	for rows.Next() {
		var regNo string
		var count int
		if err := rows.Scan(&regNo, &count); err != nil {
			return nil, err
		}
		result[regNo] = count
	}
	return result, nil
}
