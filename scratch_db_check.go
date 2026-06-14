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

	rows, err := pool.Query(ctx, "SELECT id, name, type, polygon FROM geofences LIMIT 5")
	if err != nil {
		log.Fatalf("Query failed: %v\n", err)
	}
	defer rows.Close()

	for rows.Next() {
		var id int
		var name, typ string
		var polygon []byte
		rows.Scan(&id, &name, &typ, &polygon)
		pStr := string(polygon)
		if len(pStr) > 200 {
			pStr = pStr[:200] + "..."
		}
		fmt.Printf("Geofence ID: %d, Name: %s, Type: %s\n", id, name, typ)
		fmt.Printf("Polygon JSON (truncated): %s\n\n", pStr)
	}
}
