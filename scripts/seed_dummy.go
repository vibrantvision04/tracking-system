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

	// Get a type ID
	var typeID int
	err = pool.QueryRow(context.Background(), "SELECT id FROM vehicle_types_iswm LIMIT 1").Scan(&typeID)
	if err != nil {
		log.Fatal("No vehicle types found. Run migration first.")
	}

	// Insert dummy vehicle
	var vehicleID int
	err = pool.QueryRow(context.Background(), `
		INSERT INTO vehicles (registration_no, vehicle_type_id, name, plate_number)
		VALUES ('RJ14-GB-1234', $1, 'Jaipur Vehicle 1', 'RJ14-GB-1234')
		RETURNING id`, typeID).Scan(&vehicleID)
	if err != nil {
		log.Fatal(err)
	}

	// Insert dummy device
	_, err = pool.Exec(context.Background(), `
		INSERT INTO gps_devices (imei, serial_no, model, status)
		VALUES ('123456789012345', 'SN-999', 'FMB120', 'active')`)
	if err != nil {
		log.Fatal(err)
	}

	// Link them
	_, err = pool.Exec(context.Background(), `
		INSERT INTO vehicle_device_mapping (vehicle_id, imei, is_active)
		VALUES ($1, '123456789012345', true)`, vehicleID)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("Dummy vehicle and device created!")
}
