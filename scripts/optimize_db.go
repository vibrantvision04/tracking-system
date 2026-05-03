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

	queries := []string{
		// Indexes for fast JOINs
		"CREATE INDEX IF NOT EXISTS idx_vehicle_gps_map_vehicle_id ON vehicle_gps_map (vehicle_id)",
		"CREATE INDEX IF NOT EXISTS idx_vehicle_gps_map_device_id ON vehicle_gps_map (device_id)",
		"CREATE INDEX IF NOT EXISTS idx_vehicle_gps_map_unassigned_at ON vehicle_gps_map (unassigned_at)",
		
		// Indexes for vehicles
		"CREATE INDEX IF NOT EXISTS idx_vehicles_type_id ON vehicles (vehicle_type_id)",
		"CREATE INDEX IF NOT EXISTS idx_vehicles_is_active ON vehicles (is_active)",

		// Indexes for devices
		"CREATE INDEX IF NOT EXISTS idx_gps_devices_status ON gps_devices (status)",
		"CREATE INDEX IF NOT EXISTS idx_gps_devices_is_active ON gps_devices (is_active)",
	}

	for _, q := range queries {
		_, err = pool.Exec(context.Background(), q)
		if err != nil {
			log.Printf("Error running query %s: %v", q, err)
		}
	}
	
	fmt.Println("Successfully added database performance indexes!")
}
