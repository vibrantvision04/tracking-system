package repository

import (
	"context"
	"gps-tracking-system/internal/decoder"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type GPSRepository struct {
	pool *pgxpool.Pool
}

func NewGPSRepository(pool *pgxpool.Pool) *GPSRepository {
	return &GPSRepository{pool: pool}
}

func (r *GPSRepository) BulkInsert(ctx context.Context, data []decoder.AVLData) error {
	if len(data) == 0 {
		return nil
	}

	// Use pgx CopyFrom for fastest bulk inserts
	rows := make([][]interface{}, len(data))
	for i, d := range data {
		rows[i] = []interface{}{
			d.IMEI,
			d.Time,
			d.Lat,
			d.Lng,
			d.Speed,
			d.Heading,
			d.Altitude,
			d.Satellites,
			d.Ignition,
			d.IO,
			d.HDOP,
			d.PDOP,
			d.Odometer,
			d.XAxis,
			d.YAxis,
			d.ZAxis,
		}
	}

	_, err := r.pool.CopyFrom(
		ctx,
		pgx.Identifier{"gps_data"},
		[]string{"imei", "time", "lat", "lng", "speed", "heading", "altitude", "satellites", "ignition", "io", "hdop", "pdop", "odometer", "x_axis", "y_axis", "z_axis"},
		pgx.CopyFromRows(rows),
	)

	return err
}

func (r *GPSRepository) GetLatest(ctx context.Context, imei string) (*decoder.AVLData, error) {
	query := `SELECT imei, time, lat, lng, speed, heading, altitude, satellites, ignition, io 
			  FROM gps_data WHERE imei = $1 ORDER BY time DESC LIMIT 1`
	
	var d decoder.AVLData
	err := r.pool.QueryRow(ctx, query, imei).Scan(
		&d.IMEI, &d.Time, &d.Lat, &d.Lng, &d.Speed, &d.Heading, &d.Altitude, &d.Satellites, &d.Ignition, &d.IO,
	)
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func (r *GPSRepository) GetByVehicle(ctx context.Context, vehicleID int, start, end time.Time) ([]decoder.AVLData, error) {
	query := `
		SELECT g.imei, g.time, g.lat, g.lng, g.speed, g.heading, g.altitude, g.satellites, g.ignition, g.io
		FROM gps_data g
		JOIN vehicle_gps_map m ON g.imei = (SELECT imei FROM gps_devices WHERE id = m.device_id)
		WHERE m.vehicle_id = $1 AND g.time >= $2 AND g.time < $3
		ORDER BY g.time ASC
	`
	rows, err := r.pool.Query(ctx, query, vehicleID, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var data []decoder.AVLData
	for rows.Next() {
		var d decoder.AVLData
		err := rows.Scan(
			&d.IMEI, &d.Time, &d.Lat, &d.Lng, &d.Speed, &d.Heading, &d.Altitude, &d.Satellites, &d.Ignition, &d.IO,
		)
		if err != nil {
			return nil, err
		}
		data = append(data, d)
	}
	return data, nil
}
