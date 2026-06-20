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
	var geomID *int = nil
	_ = geomID

	fmt.Println("\n--- Querying Geofence Poly ---\n")
	if geomID != nil {
		var poly string
		err = pool.QueryRow(ctx, "SELECT polygon::text FROM geofences WHERE id = $1", *geomID).Scan(&poly)
		if err != nil {
			fmt.Printf("Error fetching geofence: %v\n", err)
		} else {
			fmt.Printf("Polygon Length: %d\nPreview: %s\n", len(poly), poly[:mathMin(150, len(poly))])
		}
	}

	fmt.Println("\n--- Querying Route Lane Points ---\n")
	var lpCount int
	err = pool.QueryRow(ctx, "SELECT COUNT(*) FROM route_lane_points WHERE route_id = $1", routeID).Scan(&lpCount)
	if err != nil {
		fmt.Printf("Error counting lane points: %v\n", err)
	} else {
		fmt.Printf("Total Lane Points: %d\n", lpCount)
	}

	rows, err := pool.Query(ctx, "SELECT id, sequence_number, latitude, longitude FROM route_lane_points WHERE route_id = $1 ORDER BY sequence_number ASC LIMIT 10", routeID)
	if err == nil {
		for rows.Next() {
			var id, seq int
			var lat, lng float64
			rows.Scan(&id, &seq, &lat, &lng)
			fmt.Printf("  LP ID: %d, Seq: %d, Lat: %f, Lng: %f\n", id, seq, lat, lng)
		}
		rows.Close()
	}

	fmt.Println("\n--- Querying Vehicle Route Assignments ---\n")
	rows, err = pool.Query(ctx, "SELECT vehicle_id, shift_id, assigned_date, is_active FROM vehicle_route_assignments WHERE route_id = $1 AND assigned_date = $2", routeID, dateStr)
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


