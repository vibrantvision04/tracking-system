package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Coordinate struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

func (c *Coordinate) UnmarshalJSON(data []byte) error {
	var aux struct {
		X   *float64 `json:"x"`
		Y   *float64 `json:"y"`
		Lng *float64 `json:"lng"`
		Lat *float64 `json:"lat"`
	}
	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}
	if aux.X != nil {
		c.X = *aux.X
	} else if aux.Lng != nil {
		c.X = *aux.Lng
	}
	if aux.Y != nil {
		c.Y = *aux.Y
	} else if aux.Lat != nil {
		c.Y = *aux.Lat
	}
	return nil
}

type StoppagePoint struct {
	Timestamp    time.Time `json:"@timestamp"`
	IMEI         string    `json:"imei"`
	Lat          float64   `json:"lat"`
	Lng          float64   `json:"lng"`
	Speed        float64   `json:"speed"`
	Ignition     int       `json:"ignition"`
	Datetime     time.Time `json:"datetime"`
	DateTimeDate string    `json:"date_time_date"`
}

type Stoppage struct {
	StartPointIndex int           `json:"startPointIndex"`
	EndPointIndex   int           `json:"endPointIndex"`
	StartPoint      StoppagePoint `json:"startPoint"`
	EndPoint        StoppagePoint `json:"endPoint"`
	Duration        int           `json:"duration"`
}

type MovementReport struct {
	ID                        int64       `json:"id"`
	IMEI                      string      `json:"imei"`
	VehicleID                 int         `json:"vehicle_id"`
	RegistrationNo            string      `json:"registration_no"`
	VehicleType               string      `json:"vehicle_type"`
	Zone                      string      `json:"zone"`
	Ward                      string      `json:"ward"`
	ReportDate                time.Time   `json:"report_date"`
	AverageSpeed              float64     `json:"average_speed"`
	TotalDistance             float64     `json:"total_distance"`
	StartPoint                *Coordinate `json:"start_point"`
	EndPoint                  *Coordinate `json:"end_point"`
	StartTime                 *time.Time  `json:"start_time"`
	EndTime                   *time.Time  `json:"end_time"`
	Alert                     int         `json:"alert"`
	TotalActiveDuration       string      `json:"total_active_duration"`    // "HH:MM:SS"
	TotalIdleDuration         string      `json:"total_idle_duration"`
	TotalStoppageDuration     string      `json:"total_stoppage_duration"`
	StoppagesCount            int         `json:"stoppages_count"`
	InParkingDuration         string      `json:"in_parking_duration"`
	ActualIgnitionOnDuration  string      `json:"actual_ignition_on_duration"`
	TotalIgnitionOnDuration   string      `json:"total_ignition_on_duration"`
	TotalRunningDuration      string      `json:"total_running_duration"`
	TotalRunningTime          string      `json:"total_running_time"`
	DayRunningTime            string      `json:"day_running_time"`
	NightRunningTime          string      `json:"night_running_time"`
	FuelInLtr                 float64     `json:"fuel_in_ltr"`
	FuelConsumption           float64     `json:"fuel_consumption"`
	SpeedLimit                float64     `json:"speed_limit"`
	MaxSpeed                  float64     `json:"max_speed"`
	MinSpeed                  float64     `json:"min_speed"`
	OverspeedDistance         float64     `json:"overspeed_distance"`
	OverspeedCount            string      `json:"overspeed_count"`
	OverspeedTime             string      `json:"overspeed_time"`
	IsFinalized               bool        `json:"is_finalized"`
	MinorStoppages            int         `json:"minor_stoppages"`
	MajorStoppages            int         `json:"major_stoppages"`
	Stoppages                 []Stoppage  `json:"stoppages"`
}

type ReportRepository struct {
	pool *pgxpool.Pool
}

func NewReportRepository(pool *pgxpool.Pool) *ReportRepository {
	return &ReportRepository{pool: pool}
}

func (r *ReportRepository) Upsert(ctx context.Context, rep *MovementReport) error {
	query := `INSERT INTO movement_reports 
			  (imei, vehicle_id, report_date, average_speed, total_distance, start_point, end_point, 
			   start_time, end_time, alert, total_active_duration, total_idle_duration, 
			   total_stoppage_duration, in_parking_duration, actual_ignition_on_duration, 
			   total_ignition_on_duration, total_running_duration, total_running_time, 
			   day_running_time, night_running_time, fuel_in_ltr, fuel_consumption, 
			   speed_limit, max_speed, min_speed, overspeed_distance, overspeed_count, overspeed_time,
			   zone, ward, stoppages_count, minor_stoppages, major_stoppages, stoppages)
			  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34)
			  ON CONFLICT (imei, report_date) DO UPDATE SET
			  average_speed = EXCLUDED.average_speed,
			  total_distance = EXCLUDED.total_distance,
			  start_point = EXCLUDED.start_point,
			  end_point = EXCLUDED.end_point,
			  start_time = EXCLUDED.start_time,
			  end_time = EXCLUDED.end_time,
			  alert = EXCLUDED.alert,
			  total_active_duration = EXCLUDED.total_active_duration,
			  total_idle_duration = EXCLUDED.total_idle_duration,
			  total_stoppage_duration = EXCLUDED.total_stoppage_duration,
			  in_parking_duration = EXCLUDED.in_parking_duration,
			  actual_ignition_on_duration = EXCLUDED.actual_ignition_on_duration,
			  total_ignition_on_duration = EXCLUDED.total_ignition_on_duration,
			  total_running_duration = EXCLUDED.total_running_duration,
			  total_running_time = EXCLUDED.total_running_time,
			  day_running_time = EXCLUDED.day_running_time,
			  night_running_time = EXCLUDED.night_running_time,
			  fuel_in_ltr = EXCLUDED.fuel_in_ltr,
			  fuel_consumption = EXCLUDED.fuel_consumption,
			  speed_limit = EXCLUDED.speed_limit,
			  max_speed = EXCLUDED.max_speed,
			  min_speed = EXCLUDED.min_speed,
			  overspeed_distance = EXCLUDED.overspeed_distance,
			  overspeed_count = EXCLUDED.overspeed_count,
			  overspeed_time = EXCLUDED.overspeed_time,
			  zone = EXCLUDED.zone,
			  ward = EXCLUDED.ward,
			  stoppages_count = EXCLUDED.stoppages_count,
			  minor_stoppages = EXCLUDED.minor_stoppages,
			  major_stoppages = EXCLUDED.major_stoppages,
			  stoppages = EXCLUDED.stoppages
			  WHERE NOT movement_reports.is_finalized`
	
	_, err := r.pool.Exec(ctx, query,
		rep.IMEI, rep.VehicleID, rep.ReportDate, rep.AverageSpeed, rep.TotalDistance, rep.StartPoint, rep.EndPoint,
		rep.StartTime, rep.EndTime, rep.Alert, rep.TotalActiveDuration, rep.TotalIdleDuration,
		rep.TotalStoppageDuration, rep.InParkingDuration, rep.ActualIgnitionOnDuration,
		rep.TotalIgnitionOnDuration, rep.TotalRunningDuration, rep.TotalRunningTime,
		rep.DayRunningTime, rep.NightRunningTime, rep.FuelInLtr, rep.FuelConsumption,
		rep.SpeedLimit, rep.MaxSpeed, rep.MinSpeed, rep.OverspeedDistance, rep.OverspeedCount, rep.OverspeedTime,
		rep.Zone, rep.Ward, rep.StoppagesCount, rep.MinorStoppages, rep.MajorStoppages, rep.Stoppages,
	)
	return err
}

func (r *ReportRepository) FinalizeReportsForDate(ctx context.Context, date time.Time) error {
	day := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())
	_, err := r.pool.Exec(ctx,
		`UPDATE movement_reports SET is_finalized = true WHERE report_date = $1`,
		day,
	)
	return err
}

func (r *ReportRepository) UnfinalizeReportsForDate(ctx context.Context, date time.Time, vehicleID int) error {
	day := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())
	if vehicleID > 0 {
		_, err := r.pool.Exec(ctx,
			`UPDATE movement_reports SET is_finalized = false WHERE report_date = $1 AND vehicle_id = $2`,
			day, vehicleID,
		)
		return err
	}
	_, err := r.pool.Exec(ctx,
		`UPDATE movement_reports SET is_finalized = false WHERE report_date = $1`,
		day,
	)
	return err
}

func (r *ReportRepository) Get(ctx context.Context, vehicleID int, from, to time.Time, limit, offset int, zoneID, wardID int) ([]MovementReport, int, error) {
	var query string
	var rows pgx.Rows
	var err error
	var totalCount int

	baseQuery := `SELECT r.id, r.imei, r.vehicle_id, COALESCE(v.registration_no, ''), COALESCE(vt.vehicle_type_name, ''), r.report_date, COALESCE(r.average_speed, 0.0), COALESCE(r.total_distance, 0.0), r.start_point, r.end_point, 
			  r.start_time, r.end_time, COALESCE(r.alert, 0), COALESCE(r.total_active_duration, ''), COALESCE(r.total_idle_duration, ''), 
			  COALESCE(r.total_stoppage_duration, ''), COALESCE(r.in_parking_duration, ''), COALESCE(r.actual_ignition_on_duration, ''), 
			  COALESCE(r.total_ignition_on_duration, ''), COALESCE(r.total_running_duration, ''), COALESCE(r.total_running_time, ''), 
			  COALESCE(r.day_running_time, ''), COALESCE(r.night_running_time, ''), COALESCE(r.fuel_in_ltr, 0.0), COALESCE(r.fuel_consumption, 0.0), 
			  COALESCE(r.speed_limit, 0.0), COALESCE(r.max_speed, 0.0), COALESCE(r.min_speed, 0.0), COALESCE(r.overspeed_distance, 0.0), COALESCE(r.overspeed_count, '0'), COALESCE(r.overspeed_time, '0'),
			  COALESCE(r.zone, ''), COALESCE(r.ward, ''), COALESCE(r.stoppages_count, 0), COALESCE(r.minor_stoppages, 0), COALESCE(r.major_stoppages, 0),
			  r.stoppages
			  FROM movement_reports r
			  JOIN vehicles v ON r.vehicle_id = v.id
			  LEFT JOIN vehicle_types_vswm vt ON v.vehicle_type_id = vt.id `

	countQuery := `SELECT COUNT(*) 
	               FROM movement_reports r 
	               JOIN vehicles v ON r.vehicle_id = v.id `

	var conditions []string
	var args []interface{}
	argCount := 1

	conditions = append(conditions, fmt.Sprintf("r.report_date BETWEEN $%d AND $%d", argCount, argCount+1))
	args = append(args, from, to)
	argCount += 2

	if vehicleID > 0 {
		conditions = append(conditions, fmt.Sprintf("r.vehicle_id = $%d", argCount))
		args = append(args, vehicleID)
		argCount++
	}
	if zoneID > 0 {
		conditions = append(conditions, fmt.Sprintf("v.zone_id = $%d", argCount))
		args = append(args, zoneID)
		argCount++
	}
	if wardID > 0 {
		conditions = append(conditions, fmt.Sprintf("v.ward_id = $%d", argCount))
		args = append(args, wardID)
		argCount++
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = " WHERE " + strings.Join(conditions, " AND ")
	}

	// Count query
	err = r.pool.QueryRow(ctx, countQuery+whereClause, args...).Scan(&totalCount)
	if err != nil {
		return nil, 0, err
	}

	// Paginated query
	query = baseQuery + whereClause + fmt.Sprintf(" ORDER BY r.report_date DESC LIMIT $%d OFFSET $%d", argCount, argCount+1)
	args = append(args, limit, offset)

	rows, err = r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var reports []MovementReport
	for rows.Next() {
		var rep MovementReport
		err := rows.Scan(
			&rep.ID, &rep.IMEI, &rep.VehicleID, &rep.RegistrationNo, &rep.VehicleType, &rep.ReportDate, &rep.AverageSpeed, &rep.TotalDistance, &rep.StartPoint, &rep.EndPoint,
			&rep.StartTime, &rep.EndTime, &rep.Alert, &rep.TotalActiveDuration, &rep.TotalIdleDuration,
			&rep.TotalStoppageDuration, &rep.InParkingDuration, &rep.ActualIgnitionOnDuration,
			&rep.TotalIgnitionOnDuration, &rep.TotalRunningDuration, &rep.TotalRunningTime,
			&rep.DayRunningTime, &rep.NightRunningTime, &rep.FuelInLtr, &rep.FuelConsumption,
			&rep.SpeedLimit, &rep.MaxSpeed, &rep.MinSpeed, &rep.OverspeedDistance, &rep.OverspeedCount, &rep.OverspeedTime,
			&rep.Zone, &rep.Ward, &rep.StoppagesCount, &rep.MinorStoppages, &rep.MajorStoppages,
			&rep.Stoppages,
		)
		if err != nil {
			return nil, 0, err
		}
		reports = append(reports, rep)
	}
	return reports, totalCount, nil
}
