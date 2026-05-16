//go:build ignore
// +build ignore

package main

import (
	"context"
	"fmt"
	"gps-tracking-system/internal/config"
	"gps-tracking-system/internal/repository"
	"log"
)

func main() {
	fmt.Println("Connecting to DB...")
	cfg := config.LoadConfig()
	db, err := repository.InitDB(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to DB: %v", err)
	}
	defer db.Close()

	ctx := context.Background()

	var count int
	err = db.QueryRow(ctx, "SELECT COUNT(*) FROM gps_data").Scan(&count)
	if err != nil {
		log.Printf("Failed to count gps_data: %v", err)
	} else {
		fmt.Printf("Current gps_data count: %d\n", count)
	}

	fmt.Println("Deleting all GPS data to free space...")
	res, err := db.Exec(ctx, "DELETE FROM gps_data")
	if err != nil {
		log.Fatalf("Failed to delete gps_data: %v", err)
	}
	fmt.Printf("Deleted %d rows from gps_data\n", res.RowsAffected())

	// Also vacuum if possible (Neon might not support it or do it automatically)
	_, err = db.Exec(ctx, "VACUUM gps_data")
	if err != nil {
		log.Printf("Warning: VACUUM failed: %v", err)
	}

	fmt.Println("Done!")
}
