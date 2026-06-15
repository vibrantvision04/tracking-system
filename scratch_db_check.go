package main

import (
	"context"
	"fmt"
	"log"

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

	fmt.Println("--- Vehicle GPS Map Duplicates ---")
	rows, err := pool.Query(ctx, `
		SELECT vehicle_id, COUNT(*) as count 
		FROM vehicle_gps_map 
		WHERE unassigned_at IS NULL 
		GROUP BY vehicle_id 
		HAVING COUNT(*) > 1
	`)
	if err != nil {
		log.Fatalf("Query failed: %v\n", err)
	}
	for rows.Next() {
		var vid, cnt int
		rows.Scan(&vid, &cnt)
		fmt.Printf("Vehicle ID: %d has %d active GPS device mappings!\n", vid, cnt)
	}
	rows.Close()

	fmt.Println("\n--- Device GPS Map Duplicates ---")
	rows, err = pool.Query(ctx, `
		SELECT device_id, COUNT(*) as count 
		FROM vehicle_gps_map 
		WHERE unassigned_at IS NULL 
		GROUP BY device_id 
		HAVING COUNT(*) > 1
	`)
	if err != nil {
		log.Fatalf("Query failed: %v\n", err)
	}
	for rows.Next() {
		var did, cnt int
		rows.Scan(&did, &cnt)
		fmt.Printf("Device ID: %d has %d active vehicle mappings!\n", did, cnt)
	}
	rows.Close()

	fmt.Println("\n--- Vehicle Route Assignment Duplicates ---")
	rows, err = pool.Query(ctx, `
		SELECT vehicle_id, shift_id, assigned_date, COUNT(*) as count 
		FROM vehicle_route_assignments 
		WHERE is_active = true
		GROUP BY vehicle_id, shift_id, assigned_date 
		HAVING COUNT(*) > 1
	`)
	if err != nil {
		log.Fatalf("Query failed: %v\n", err)
	}
	for rows.Next() {
		var vid, sid int
		var date interface{}
		var cnt int
		rows.Scan(&vid, &sid, &date, &cnt)
		fmt.Printf("Vehicle ID: %d, Shift ID: %d, Date: %v has %d active route assignments!\n", vid, sid, date, cnt)
	}
	rows.Close()

	fmt.Println("\n--- All Active Mappings for vehicle RJ47GA7278 (if exists) ---")
	rows, err = pool.Query(ctx, `
		SELECT v.id, v.registration_no, m.device_id, d.imei, m.unassigned_at
		FROM vehicles v
		LEFT JOIN vehicle_gps_map m ON v.id = m.vehicle_id
		LEFT JOIN gps_devices d ON m.device_id = d.id
		WHERE v.registration_no LIKE '%7278%'
	`)
	if err != nil {
		log.Fatalf("Query failed: %v\n", err)
	}
	for rows.Next() {
		var vid, did int
		var reg, imei string
		var unassigned interface{}
		rows.Scan(&vid, &reg, &did, &imei, &unassigned)
		fmt.Printf("Vehicle ID: %d, Reg: %s, Device ID: %d, IMEI: %s, Unassigned: %v\n", vid, reg, did, imei, unassigned)
	}
	rows.Close()
}

