package repository

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Geofence struct {
	ID        int       `json:"id"`
	Name      string    `json:"name"`
	Type      string    `json:"type"`
	Polygon   []byte    `json:"polygon"` // JSONB encoded GeoJSON
	Color     string    `json:"color"`
	OwnerID   int       `json:"owner_id"`
	CreatedAt time.Time `json:"created_at"`
}

type GeofenceEvent struct {
	ID         int       `json:"id"`
	VehicleID  int       `json:"vehicle_id"`
	GeofenceID int       `json:"geofence_id"`
	EventType  string    `json:"event_type"` // enter/exit
	Time       time.Time `json:"time"`
	Lat        float64   `json:"lat"`
	Lng        float64   `json:"lng"`
}

type GeofenceRepository struct {
	pool *pgxpool.Pool
}

func NewGeofenceRepository(pool *pgxpool.Pool) *GeofenceRepository {
	return &GeofenceRepository{pool: pool}
}

func (r *GeofenceRepository) GetAll(ctx context.Context) ([]Geofence, error) {
	query := `SELECT id, name, type, polygon, color, owner_id, created_at FROM geofences`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var geofences []Geofence
	for rows.Next() {
		var g Geofence
		if err := rows.Scan(&g.ID, &g.Name, &g.Type, &g.Polygon, &g.Color, &g.OwnerID, &g.CreatedAt); err != nil {
			return nil, err
		}
		geofences = append(geofences, g)
	}
	return geofences, nil
}

func (r *GeofenceRepository) SaveEvent(ctx context.Context, e *GeofenceEvent) error {
	query := `INSERT INTO geofence_events (vehicle_id, geofence_id, event_type, time, lat, lng)
			  VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`
	return r.pool.QueryRow(ctx, query, e.VehicleID, e.GeofenceID, e.EventType, e.Time, e.Lat, e.Lng).Scan(&e.ID)
}
