package main

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load(".env")
	dsn := os.Getenv("DB_DSN")
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		fmt.Printf("Unable to connect to database: %v\n", err)
		return
	}
	defer conn.Close(ctx)

	// Query vehicles
	fmt.Println("--- VEHICLES ---")
	vRows, _ := conn.Query(ctx, "SELECT id, registration_no, vehicle_type_id, zone_id, ward_id, is_active FROM vehicles")
	for vRows.Next() {
		var id, vTypeId int
		var regNo string
		var zoneId, wardId *int
		var isActive bool
		_ = vRows.Scan(&id, &regNo, &vTypeId, &zoneId, &wardId, &isActive)
		fmt.Printf("ID: %d | RegNo: %s | TypeID: %d | ZoneID: %v | WardID: %v | Active: %t\n", id, regNo, vTypeId, zoneId, wardId, isActive)
	}
	vRows.Close()

	// Query gps_devices
	fmt.Println("\n--- GPS DEVICES ---")
	dRows, _ := conn.Query(ctx, "SELECT id, imei, status, is_active FROM gps_devices")
	for dRows.Next() {
		var id int
		var imei, status string
		var isActive bool
		_ = dRows.Scan(&id, &imei, &status, &isActive)
		fmt.Printf("ID: %d | IMEI: %s | Status: %s | Active: %t\n", id, imei, status, isActive)
	}
	dRows.Close()

	// Query mappings
	fmt.Println("\n--- MAPS ---")
	mRows, _ := conn.Query(ctx, "SELECT vehicle_id, device_id FROM vehicle_gps_map")
	for mRows.Next() {
		var vId, dId int
		_ = mRows.Scan(&vId, &dId)
		fmt.Printf("VehicleID: %d | DeviceID: %d\n", vId, dId)
	}
	mRows.Close()

	// Query gps_data count per IMEI
	fmt.Println("\n--- GPS DATA STATS ---")
	sRows, _ := conn.Query(ctx, "SELECT imei, COUNT(*), MIN(captured_at), MAX(captured_at) FROM gps_data GROUP BY imei")
	for sRows.Next() {
		var imei string
		var count int
		var minTime, maxTime interface{}
		_ = sRows.Scan(&imei, &count, &minTime, &maxTime)
		fmt.Printf("IMEI: %s | Count: %d | MinTime: %v | MaxTime: %v\n", imei, count, minTime, maxTime)
	}
	sRows.Close()
}
