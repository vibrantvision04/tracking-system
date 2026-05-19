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

	rows, _ := conn.Query(ctx, "SELECT speed, COUNT(*) FROM gps_data GROUP BY speed ORDER BY speed")
	defer rows.Close()
	fmt.Println("Speed distribution:")
	for rows.Next() {
		var speed, count int
		_ = rows.Scan(&speed, &count)
		fmt.Printf("Speed: %d | Count: %d\n", speed, count)
	}
}
