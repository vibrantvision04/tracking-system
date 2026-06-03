package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type ParkingSpot struct {
	ID             int    `json:"id"`
	Name           string `json:"name"`
	Address        string `json:"address"`
	ContactNumber  string `json:"contact_number"`
	GeofenceID     *int   `json:"geofence_id"`
	IsActive       bool   `json:"is_active"`
	CreatedAt      string `json:"created_at"`
	// Additional fields from join
	GeoJSON        []byte `json:"geojson,omitempty"`
	Color          string `json:"color,omitempty"`
}

type ParkingSpotRepository struct {
	pool *pgxpool.Pool
}

func NewParkingSpotRepository(pool *pgxpool.Pool) *ParkingSpotRepository {
	return &ParkingSpotRepository{pool: pool}
}

func (r *ParkingSpotRepository) GetAll(ctx context.Context) ([]ParkingSpot, error) {
	query := `
		SELECT 
			p.id, 
			p.parking_lot_name, 
			COALESCE(p.address, ''), 
			COALESCE(p.contact_no, ''), 
			p.geofence_id, 
			COALESCE(p.is_active, true),
			TO_CHAR(p.created_at, 'YYYY-MM-DD HH24:MI:SS'),
			g.polygon,
			COALESCE(g.color, '#fba339')
		FROM parking_lots p
		LEFT JOIN geofences g ON p.geofence_id = g.id
		ORDER BY p.id DESC
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []ParkingSpot
	for rows.Next() {
		var p ParkingSpot
		var geojson []byte
		err := rows.Scan(&p.ID, &p.Name, &p.Address, &p.ContactNumber, &p.GeofenceID, &p.IsActive, &p.CreatedAt, &geojson, &p.Color)
		if err == nil {
			if len(geojson) > 0 {
				p.GeoJSON = geojson
			}
			list = append(list, p)
		}
	}
	return list, nil
}

func (r *ParkingSpotRepository) Delete(ctx context.Context, id int) error {
	// First get the geofence_id
	var geofenceID *int
	err := r.pool.QueryRow(ctx, "SELECT geofence_id FROM parking_lots WHERE id = $1", id).Scan(&geofenceID)
	if err != nil {
		return err
	}
	
	_, err = r.pool.Exec(ctx, "DELETE FROM parking_lots WHERE id = $1", id)
	if err != nil {
		return err
	}

	if geofenceID != nil {
		// Clean up the geofence as well
		_, _ = r.pool.Exec(ctx, "DELETE FROM geofences WHERE id = $1", *geofenceID)
	}

	return nil
}

func (r *ParkingSpotRepository) Pool() *pgxpool.Pool {
	return r.pool
}
