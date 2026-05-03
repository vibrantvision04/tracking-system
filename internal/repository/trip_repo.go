package repository

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Trip struct {
	ID        int       `json:"id"`
	VehicleID int       `json:"vehicle_id"`
	IMEI      string    `json:"imei"`
	StartTime time.Time `json:"start_time"`
	EndTime   *time.Time `json:"end_time"`
	Distance  float64   `json:"distance"`
	MaxSpeed  float64   `json:"max_speed"`
	AvgSpeed  float64   `json:"avg_speed"`
	StartLat  float64   `json:"start_lat"`
	StartLng  float64   `json:"start_lng"`
	EndLat    float64   `json:"end_lat"`
	EndLng    float64   `json:"end_lng"`
	Path      []byte    `json:"path"` // JSONB encoded
}

type TripRepository struct {
	pool *pgxpool.Pool
}

func NewTripRepository(pool *pgxpool.Pool) *TripRepository {
	return &TripRepository{pool: pool}
}

func (r *TripRepository) Create(ctx context.Context, t *Trip) error {
	query := `INSERT INTO trips (vehicle_id, imei, start_time, end_time, distance, max_speed, avg_speed, start_lat, start_lng, end_lat, end_lng, path)
			  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`
	return r.pool.QueryRow(ctx, query, 
		t.VehicleID, t.IMEI, t.StartTime, t.EndTime, t.Distance, t.MaxSpeed, t.AvgSpeed, t.StartLat, t.StartLng, t.EndLat, t.EndLng, t.Path,
	).Scan(&t.ID)
}

func (r *TripRepository) GetByVehicle(ctx context.Context, vehicleID int, from, to time.Time) ([]Trip, error) {
	query := `SELECT id, vehicle_id, imei, start_time, end_time, distance, max_speed, avg_speed, start_lat, start_lng, end_lat, end_lng, path
			  FROM trips WHERE vehicle_id = $1 AND start_time BETWEEN $2 AND $3 ORDER BY start_time DESC`
	
	rows, err := r.pool.Query(ctx, query, vehicleID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var trips []Trip
	for rows.Next() {
		var t Trip
		err := rows.Scan(
			&t.ID, &t.VehicleID, &t.IMEI, &t.StartTime, &t.EndTime, &t.Distance, &t.MaxSpeed, &t.AvgSpeed, &t.StartLat, &t.StartLng, &t.EndLat, &t.EndLng, &t.Path,
		)
		if err != nil {
			return nil, err
		}
		trips = append(trips, t)
	}
	return trips, nil
}
