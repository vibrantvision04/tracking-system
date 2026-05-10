package main

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5"
)

func main() {
	dsn := "postgres://gps:password@localhost:5432/gpsdb"
	
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to connect to database: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(ctx)

	sqlFile := "migrations/999_fix_everything.sql"
	content, err := os.ReadFile(sqlFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to read SQL file: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Applying migration: %s\n", sqlFile)
	_, err = conn.Exec(ctx, string(content))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Query failed: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Migration applied successfully!")
}
