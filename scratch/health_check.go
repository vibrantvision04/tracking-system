//go:build ignore
// +build ignore

package main

import (
	"context"
	"fmt"
	"gps-tracking-system/internal/config"
	"gps-tracking-system/internal/repository"
	"time"
)

func main() {
	cfg := config.LoadConfig()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	fmt.Printf("Connecting to restored database: %s\n", cfg.DBDSN[:30]+"...")
	db, err := repository.InitDB(cfg)
	if err != nil {
		fmt.Printf("DATABASE CONNECTION FAILED: %v\n", err)
		return
	}
	defer db.Close()

	var count int
	err = db.QueryRow(ctx, "SELECT COUNT(*) FROM gps_data").Scan(&count)
	if err != nil {
		fmt.Printf("QUERY FAILED: %v\n", err)
		return
	}

	fmt.Printf("SUCCESS! Database connected. Found %d GPS records.\n", count)
}
