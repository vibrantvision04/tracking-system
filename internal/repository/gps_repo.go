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

func (r *GPSRepository) Pool() *pgxpool.Pool {
	return r.pool
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
			d.Speed,
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
	var speed float64
	var heading int16
	err := r.pool.QueryRow(ctx, query, imei).Scan(
		&d.IMEI, &d.Time, &d.Lat, &d.Lng, &speed, &heading, &d.Altitude, &d.Satellites, &ign,
	)
	if err != nil {
		return nil, err
	}
	d.Ignition = (ign == 1)
	d.Speed = speed
	d.Heading = int(heading)
	return &d, nil
}

func (r *GPSRepository) GetByVehicle(ctx context.Context, vehicleID int, start, end time.Time) ([]decoder.AVLData, error) {
	var imei string
	err := r.pool.QueryRow(ctx, `
		SELECT d.imei
		FROM gps_devices d
		JOIN vehicle_gps_map m ON d.id = m.device_id AND m.unassigned_at IS NULL
		WHERE m.vehicle_id = $1
		LIMIT 1
	`, vehicleID).Scan(&imei)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	query := `
		SELECT g.imei, g.captured_at, g.lat, g.lng, g.speed, g.direction, g.altitude, g.satellites, g.ignition
		FROM gps_data g
		WHERE g.imei = $1 AND g.captured_at >= $2 AND g.captured_at < $3
		ORDER BY g.captured_at ASC
	`
	rows, err := r.pool.Query(ctx, query, imei, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var data []decoder.AVLData
	for rows.Next() {
		var d decoder.AVLData
		var ign int16
		var speed float64
		var heading int16
		err := rows.Scan(
			&d.IMEI, &d.Time, &d.Lat, &d.Lng, &speed, &heading, &d.Altitude, &d.Satellites, &ign,
		)
		if err != nil {
			return nil, err
		}
		d.Ignition = (ign == 1)
		d.Speed = speed
		d.Heading = int(heading)
		data = append(data, d)
	}
	return data, nil
}

func (r *GPSRepository) GetAllByTimeWindow(ctx context.Context, start, end time.Time) (map[int][]decoder.AVLData, error) {
	query := `
		SELECT m.vehicle_id, g.imei, g.captured_at, g.lat, g.lng, g.speed, g.direction, g.altitude, g.satellites, g.ignition
		FROM gps_data g
		JOIN gps_devices d ON g.imei = d.imei
		JOIN vehicle_gps_map m ON d.id = m.device_id AND m.unassigned_at IS NULL
		WHERE g.captured_at >= $1 AND g.captured_at < $2
		ORDER BY m.vehicle_id, g.captured_at ASC
	`
	rows, err := r.pool.Query(ctx, query, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[int][]decoder.AVLData)
	for rows.Next() {
		var vID int
		var d decoder.AVLData
		var ign int16
		var speed float64
		var heading int16
		err := rows.Scan(
			&vID, &d.IMEI, &d.Time, &d.Lat, &d.Lng, &speed, &heading, &d.Altitude, &d.Satellites, &ign,
		)
		if err != nil {
			return nil, err
		}
		d.Ignition = (ign == 1)
		d.Speed = speed
		d.Heading = int(heading)
		result[vID] = append(result[vID], d)
	}
	return result, nil
}

func (r *GPSRepository) UpdateLatestGPS(ctx context.Context, data []decoder.AVLData) error {
	if len(data) == 0 {
		return nil
	}

	// Filter and find the latest record per IMEI in this batch
	latest := make(map[string]decoder.AVLData)
	for _, d := range data {
		if d.Lat == 0 && d.Lng == 0 {
			continue
		}
		existing, found := latest[d.IMEI]
		if !found || d.Time.After(existing.Time) {
			latest[d.IMEI] = d
		}
	}

	if len(latest) == 0 {
		return nil
	}

	// Execute batch upserts
	// We'll use a transaction with a prepared statement or pgx batch for optimal bulk execution
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	query := `
		INSERT INTO latest_gps_data (imei, captured_at, lat, lng, speed, heading, altitude, satellites, ignition, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
		ON CONFLICT (imei) DO UPDATE SET
			captured_at = EXCLUDED.captured_at,
			lat = EXCLUDED.lat,
			lng = EXCLUDED.lng,
			speed = EXCLUDED.speed,
			heading = EXCLUDED.heading,
			altitude = EXCLUDED.altitude,
			satellites = EXCLUDED.satellites,
			ignition = EXCLUDED.ignition,
			updated_at = NOW()
		WHERE EXCLUDED.captured_at >= latest_gps_data.captured_at
	`

	for _, d := range latest {
		_, err := tx.Exec(ctx, query,
			d.IMEI,
			d.Time,
			d.Lat,
			d.Lng,
			d.Speed,
			d.Heading,
			d.Altitude,
			d.Satellites,
			d.Ignition,
		)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

