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

	db, err := repository.InitDB(cfg)
	if err != nil {
		fmt.Printf("FAILED: %v\n", err)
		return
	}
	defer db.Close()

	var minTime, maxTime time.Time
	err = db.QueryRow(ctx, "SELECT MIN(captured_at), MAX(captured_at) FROM gps_data").Scan(&minTime, &maxTime)
	if err != nil {
		fmt.Printf("QUERY FAILED: %v (Maybe table is empty?)\n", err)
		return
	}

	fmt.Printf("Data Start: %v\n", minTime)
	fmt.Printf("Data End:   %v\n", maxTime)
}
