package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
)

type GeoJSONGeometry struct {
	Type        string        `json:"type"`
	Coordinates [][]float64   `json:"coordinates"`
}

type GeoJSONFeature struct {
	Type     string          `json:"type"`
	Geometry GeoJSONGeometry `json:"geometry"`
}

func parseCoordinatesFromGeoJSON(geojsonStr string) [][]float64 {
	if geojsonStr == "" {
		return nil
	}
	var feature GeoJSONFeature
	if err := json.Unmarshal([]byte(geojsonStr), &feature); err == nil && feature.Geometry.Type == "LineString" {
		return feature.Geometry.Coordinates
	}
	var geom GeoJSONGeometry
	if err := json.Unmarshal([]byte(geojsonStr), &geom); err == nil && geom.Type == "LineString" {
		return geom.Coordinates
	}
	return nil
}

func main() {
	dsn := "postgres://gps:password@localhost:5432/gpsdb"
	ctx := context.Background()

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v\n", err)
	}
	defer pool.Close()

	// Query all routes and their geojson
	rows, err := pool.Query(ctx, `
		SELECT r.id, r.route_name, COALESCE(g.polygon::text, '') 
		FROM routes r 
		LEFT JOIN geofences g ON r.geometry_id = g.id
	`)
	if err != nil {
		log.Fatalf("Error querying routes: %v\n", err)
	}
	defer rows.Close()

	type RouteInfo struct {
		ID      int
		Name    string
		GeoJSON string
	}
	var routes []RouteInfo
	for rows.Next() {
		var r RouteInfo
		rows.Scan(&r.ID, &r.Name, &r.GeoJSON)
		routes = append(routes, r)
	}

	for _, r := range routes {
		if r.GeoJSON == "" {
			fmt.Printf("Route ID %d (%s) has no GeoJSON path\n", r.ID, r.Name)
			continue
		}

		coords := parseCoordinatesFromGeoJSON(r.GeoJSON)
		if len(coords) == 0 {
			fmt.Printf("Route ID %d (%s) parsed 0 coordinates\n", r.ID, r.Name)
			continue
		}

		fmt.Printf("Route ID %d (%s): parsed %d coordinates. Syncing...\n", r.ID, r.Name, len(coords))

		// Start transaction
		tx, err := pool.Begin(ctx)
		if err != nil {
			fmt.Printf("  Tx start error: %v\n", err)
			continue
		}

		// Delete old
		_, _ = tx.Exec(ctx, "DELETE FROM route_checkpoints WHERE route_id = $1", r.ID)
		_, _ = tx.Exec(ctx, "DELETE FROM route_lane_points WHERE route_id = $1", r.ID)

		// Insert new (actual vertex coordinates)
		for idx, c := range coords {
			if len(c) < 2 {
				continue
			}
			seq := idx + 1
			name := r.Name + "_Point" + strconv.Itoa(seq)
			lat := c[1]
			lng := c[0]

			_, err = tx.Exec(ctx, `
				INSERT INTO route_checkpoints (route_id, checkpoint_name, latitude, longitude, radius_meters, sequence_order)
				VALUES ($1, $2, $3, $4, 10.0, $5)
			`, r.ID, name, lat, lng, seq)
			if err != nil {
				fmt.Printf("  Insert checkpoint error: %v\n", err)
			}

			_, err = tx.Exec(ctx, `
				INSERT INTO route_lane_points (route_id, sequence_number, latitude, longitude)
				VALUES ($1, $2, $3, $4)
			`, r.ID, seq, lat, lng)
			if err != nil {
				fmt.Printf("  Insert lane point error: %v\n", err)
			}
		}

		err = tx.Commit(ctx)
		if err != nil {
			fmt.Printf("  Commit error: %v\n", err)
		} else {
			fmt.Printf("  Successfully synced %d checkpoints/lane points.\n", len(coords))
		}
	}
}
