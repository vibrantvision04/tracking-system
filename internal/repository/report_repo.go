package repository

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type MovementReport struct {
	ID                        int64     `json:"id"`
	IMEI                      string    `json:"imei"`
	VehicleID                 int       `json:"vehicle_id"`
	ReportDate                time.Time `json:"report_date"`
	AverageSpeed              float64   `json:"average_speed"`
	TotalDistance             float64   `json:"total_distance"`
	StartPoint                string    `json:"start_point"` // JSON string
	EndPoint                  string    `json:"end_point"`   // JSON string
	StartTime                 time.Time `json:"start_time"`
	EndTime                   time.Time `json:"end_time"`
	Alert                     int       `json:"alert"`
	TotalActiveDuration       string    `json:"total_active_duration"`    // "HH:MM:SS"
	TotalIdleDuration         string    `json:"total_idle_duration"`
	TotalStoppageDuration     string    `json:"total_stoppage_duration"`
	InParkingDuration         string    `json:"in_parking_duration"`
	ActualIgnitionOnDuration  string    `json:"actual_ignition_on_duration"`
	TotalIgnitionOnDuration   string    `json:"total_ignition_on_duration"`
	TotalRunningDuration      string    `json:"total_running_duration"`
	TotalRunningTime          string    `json:"total_running_time"`
	DayRunningTime            string    `json:"day_running_time"`
	NightRunningTime          string    `json:"night_running_time"`
	FuelInLtr                 float64   `json:"fuel_in_ltr"`
	FuelConsumption           float64   `json:"fuel_consumption"`
	SpeedLimit                float64   `json:"speed_limit"`
	MaxSpeed                  float64   `json:"max_speed"`
	MinSpeed                  float64   `json:"min_speed"`
	OverspeedDistance         float64   `json:"overspeed_distance"`
	OverspeedCount            string    `json:"overspeed_count"`
	OverspeedTime             string    `json:"overspeed_time"`
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
			   speed_limit, max_speed, min_speed, overspeed_distance, overspeed_count, overspeed_time)
			  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
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
			  overspeed_time = EXCLUDED.overspeed_time`
	
	_, err := r.pool.Exec(ctx, query,
		rep.IMEI, rep.VehicleID, rep.ReportDate, rep.AverageSpeed, rep.TotalDistance, rep.StartPoint, rep.EndPoint,
		rep.StartTime, rep.EndTime, rep.Alert, rep.TotalActiveDuration, rep.TotalIdleDuration,
		rep.TotalStoppageDuration, rep.InParkingDuration, rep.ActualIgnitionOnDuration,
		rep.TotalIgnitionOnDuration, rep.TotalRunningDuration, rep.TotalRunningTime,
		rep.DayRunningTime, rep.NightRunningTime, rep.FuelInLtr, rep.FuelConsumption,
		rep.SpeedLimit, rep.MaxSpeed, rep.MinSpeed, rep.OverspeedDistance, rep.OverspeedCount, rep.OverspeedTime,
	)
	return err
}

func (r *ReportRepository) Get(ctx context.Context, vehicleID int, from, to time.Time) ([]MovementReport, error) {
	query := `SELECT id, imei, vehicle_id, report_date, average_speed, total_distance, start_point, end_point, 
			  start_time, end_time, alert, total_active_duration, total_idle_duration, 
			  total_stoppage_duration, in_parking_duration, actual_ignition_on_duration, 
			  total_ignition_on_duration, total_running_duration, total_running_time, 
			  day_running_time, night_running_time, fuel_in_ltr, fuel_consumption, 
			  speed_limit, max_speed, min_speed, overspeed_distance, overspeed_count, overspeed_time
			  FROM movement_reports WHERE vehicle_id = $1 AND report_date BETWEEN $2 AND $3 ORDER BY report_date DESC`
	
	rows, err := r.pool.Query(ctx, query, vehicleID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reports []MovementReport
	for rows.Next() {
		var rep MovementReport
		err := rows.Scan(
			&rep.ID, &rep.IMEI, &rep.VehicleID, &rep.ReportDate, &rep.AverageSpeed, &rep.TotalDistance, &rep.StartPoint, &rep.EndPoint,
			&rep.StartTime, &rep.EndTime, &rep.Alert, &rep.TotalActiveDuration, &rep.TotalIdleDuration,
			&rep.TotalStoppageDuration, &rep.InParkingDuration, &rep.ActualIgnitionOnDuration,
			&rep.TotalIgnitionOnDuration, &rep.TotalRunningDuration, &rep.TotalRunningTime,
			&rep.DayRunningTime, &rep.NightRunningTime, &rep.FuelInLtr, &rep.FuelConsumption,
			&rep.SpeedLimit, &rep.MaxSpeed, &rep.MinSpeed, &rep.OverspeedDistance, &rep.OverspeedCount, &rep.OverspeedTime,
		)
		if err != nil {
			return nil, err
		}
		reports = append(reports, rep)
	}
	return reports, nil
}
