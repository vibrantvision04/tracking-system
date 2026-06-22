package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	dsn := "postgres://gps:password@localhost:5432/gpsdb"
	ctx := context.Background()

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v\n", err)
	}
	defer pool.Close()

	rowsRoutes, err := pool.Query(ctx, "SELECT id, route_name, is_sequential, corridor_meters, route_direction, aggressive_snapping, ai_reconstruction_enabled FROM routes")
	if err != nil {
		log.Fatalf("Error querying routes: %v\n", err)
	}
	defer rowsRoutes.Close()
	fmt.Println("--- All Routes ---")
	for rowsRoutes.Next() {
		var id int
		var name string
		var isSeq bool
		var corridor float64
		var dir string
		var aggSnap bool
		var aiRecon bool
		rowsRoutes.Scan(&id, &name, &isSeq, &corridor, &dir, &aggSnap, &aiRecon)
		fmt.Printf("ID: %d, Name: %s, IsSeq: %v, Corridor: %f, Dir: %s, Aggressive: %v, AIEnabled: %v\n", id, name, isSeq, corridor, dir, aggSnap, aiRecon)
	}

	routeID := 22
	dateStr := "2026-06-18"

	fmt.Println("\n--- Comparing Route 22 GeoJSON vs Checkpoints ---")
	var lanes []byte
	var geoJSON string
	err = pool.QueryRow(ctx, "SELECT r.lanes, COALESCE(g.polygon::text, '') FROM routes r LEFT JOIN geofences g ON r.geometry_id = g.id WHERE r.id = $1", routeID).Scan(&lanes, &geoJSON)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
	} else {
	fmt.Println("\n--- Migrating old checkpoints to route_lane_points ---")
	tag, err := pool.Exec(ctx, `
		INSERT INTO route_lane_points (route_id, sequence_number, latitude, longitude)
		SELECT route_id, sequence_order, latitude, longitude
		FROM route_checkpoints
		ON CONFLICT (route_id, sequence_number) DO NOTHING
	`)
	if err != nil {
		fmt.Printf("Error migrating: %v\n", err)
	} else {
		fmt.Printf("Migrated successfully. Rows affected: %d\n", tag.RowsAffected())
	}

	fmt.Println("\n--- Querying Route Lane Points & Checkpoints ---")
	rowsLP, err := pool.Query(ctx, `
		SELECT r.id, r.route_name,
		       (SELECT COUNT(*) FROM route_checkpoints WHERE route_id = r.id) as cp_count,
		       (SELECT COUNT(*) FROM route_lane_points WHERE route_id = r.id) as lp_count
		FROM routes r
	`)
	if err != nil {
		fmt.Printf("Error counting lane points/checkpoints: %v\n", err)
	} else {
		defer rowsLP.Close()
		for rowsLP.Next() {
			var id int
			var name string
			var cpCount, lpCount int
			rowsLP.Scan(&id, &name, &cpCount, &lpCount)
			fmt.Printf("Route ID: %d, Name: %s, Checkpoints (old): %d, Lane Points (new): %d\n", id, name, cpCount, lpCount)
		}
	}
	}

	fmt.Println("\n--- Querying Vehicle Route Assignments ---\n")
	rows, err := pool.Query(ctx, "SELECT vehicle_id, shift_id, assigned_date, is_active FROM vehicle_route_assignments WHERE route_id = $1 AND assigned_date = $2", routeID, dateStr)
	if err == nil {
		for rows.Next() {
			var vid, sid int
			var adate time.Time
			var active bool
			rows.Scan(&vid, &sid, &adate, &active)
			fmt.Printf("  Vehicle ID: %d, Shift ID: %d, Date: %s, Active: %v\n", vid, sid, adate.Format("2006-01-02"), active)
		}
		rows.Close()
	}

	fmt.Println("\n--- Querying Vehicle Lane Point Coverage ---\n")
	rows, err = pool.Query(ctx, "SELECT vehicle_id, total_points, covered_points, coverage_percent, details::text FROM vehicle_lane_point_coverage WHERE route_id = $1 AND report_date = $2", routeID, dateStr)
	if err == nil {
		for rows.Next() {
			var vid, total, covered int
			var pct float64
			var details string
			rows.Scan(&vid, &total, &covered, &pct, &details)
			fmt.Printf("  Vehicle: %d, Total LPs: %d, Covered LPs: %d, Pct: %f%%\n", vid, total, covered, pct)
			fmt.Printf("  Details Preview: %s\n", details[:mathMin(250, len(details))])
		}
		rows.Close()
	}

	fmt.Println("\n--- Querying Vehicle GPS Count for 2026-06-18 ---\n")
	// Let's find vehicle IDs assigned
	var vids []int
	rows, err = pool.Query(ctx, "SELECT vehicle_id FROM vehicle_route_assignments WHERE route_id = $1 AND assigned_date = $2", routeID, dateStr)
	if err == nil {
		for rows.Next() {
			var vid int
			rows.Scan(&vid)
			vids = append(vids, vid)
		}
		rows.Close()
	}

	for _, vid := range vids {
		var gpsCount int
		err = pool.QueryRow(ctx, "SELECT COUNT(*) FROM vehicle_gps_data WHERE vehicle_id = $1 AND timestamp >= $2 AND timestamp < $3", vid, dateStr+" 00:00:00+05:30", dateStr+" 23:59:59+05:30").Scan(&gpsCount)
		if err != nil {
			fmt.Printf("Error counting GPS data for vehicle %d: %v\n", vid, err)
		} else {
			fmt.Printf("  Vehicle ID %d has %d GPS data points\n", vid, gpsCount)
		}
	}
}

func mathMin(a, b int) int {
	if a < b {
		return a
	}
	return b
}


