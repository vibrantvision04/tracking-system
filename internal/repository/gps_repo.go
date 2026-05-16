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

	// Filter out zero lat/lng and prepare rows for bulk insert
	var rows [][]interface{}
	for _, d := range data {
		// Skip invalid coordinates (0,0)
		if d.Lat == 0 && d.Lng == 0 {
			continue
		}

		ign := 0
		if d.Ignition {
			ign = 1
		}
		rows = append(rows, []interface{}{
			d.IMEI,
			d.Time,
			d.Lat,
			d.Lng,
			int16(d.Speed),
			int16(ign),
			d.Odometer,
			float32(d.HDOP),
			int16(d.Heading),
			float32(d.Altitude),
			int16(d.Satellites),
			int16(0), // signal default 0
		})
	}

	if len(rows) == 0 {
		return nil
	}

	_, err := r.pool.CopyFrom(
		ctx,
		pgx.Identifier{"gps_data"},
		[]string{"imei", "captured_at", "lat", "lng", "speed", "ignition", "odometer", "hdop", "direction", "altitude", "satellites", "signal"},
		pgx.CopyFromRows(rows),
	)

	return err
}

func (r *GPSRepository) GetLatest(ctx context.Context, imei string) (*decoder.AVLData, error) {
	query := `SELECT imei, captured_at, lat, lng, speed, direction, altitude, satellites, ignition 
			  FROM gps_data WHERE imei = $1 ORDER BY captured_at DESC LIMIT 1`
	
	var d decoder.AVLData
	var ign int16
	var speed int16
	var heading int16
	err := r.pool.QueryRow(ctx, query, imei).Scan(
		&d.IMEI, &d.Time, &d.Lat, &d.Lng, &speed, &heading, &d.Altitude, &d.Satellites, &ign,
	)
	if err != nil {
		return nil, err
	}
	d.Ignition = (ign == 1)
	d.Speed = float64(speed)
	d.Heading = int(heading)
	return &d, nil
}

func (r *GPSRepository) GetByVehicle(ctx context.Context, vehicleID int, start, end time.Time) ([]decoder.AVLData, error) {
	query := `
		SELECT g.imei, g.captured_at, g.lat, g.lng, g.speed, g.direction, g.altitude, g.satellites, g.ignition
		FROM gps_data g
		JOIN gps_devices d ON g.imei = d.imei
		JOIN vehicle_gps_map m ON d.id = m.device_id AND m.unassigned_at IS NULL
		WHERE m.vehicle_id = $1 AND g.captured_at >= $2 AND g.captured_at < $3
		ORDER BY g.captured_at ASC
	`
	rows, err := r.pool.Query(ctx, query, vehicleID, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var data []decoder.AVLData
	for rows.Next() {
		var d decoder.AVLData
		var ign int16
		var speed int16
		var heading int16
		err := rows.Scan(
			&d.IMEI, &d.Time, &d.Lat, &d.Lng, &speed, &heading, &d.Altitude, &d.Satellites, &ign,
		)
		if err != nil {
			return nil, err
		}
		d.Ignition = (ign == 1)
		d.Speed = float64(speed)
		d.Heading = int(heading)
		data = append(data, d)
	}
	return data, nil
}
