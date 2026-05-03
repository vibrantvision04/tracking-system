//go:build ignore

package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

func main() {
	godotenv.Load()
	dsn := os.Getenv("DB_DSN")
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	// 1. Insert device if not exists
	var deviceID int
	err = pool.QueryRow(context.Background(), `
		INSERT INTO gps_devices (imei, serial_no, model, status)
		VALUES ('123456789012345', 'SN-999', 'FMB120', 'active')
		ON CONFLICT (imei) DO UPDATE SET status = 'active'
		RETURNING id`).Scan(&deviceID)
	if err != nil {
		log.Fatal("Device insert error:", err)
	}

	// 2. Get the vehicle we created
	var vehicleID int
	err = pool.QueryRow(context.Background(), "SELECT id FROM vehicles WHERE registration_no = 'RJ14-GB-1234'").Scan(&vehicleID)
	if err != nil {
		log.Fatal("Vehicle not found")
	}

	// 3. Link them correctly in vehicle_gps_map
	_, err = pool.Exec(context.Background(), `
		INSERT INTO vehicle_gps_map (vehicle_id, device_id)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING`, vehicleID, deviceID)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("Device created and linked properly!")
}
