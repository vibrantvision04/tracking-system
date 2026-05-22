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
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/gps_tracking?sslmode=disable"
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	tag, err := pool.Exec(ctx, "UPDATE route_checkpoints SET radius_meters = 8.0 WHERE radius_meters = 10.0")
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Updated %d checkpoints to 8 meters.\n", tag.RowsAffected())
}
