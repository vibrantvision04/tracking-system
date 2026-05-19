package main

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5"
)

func main() {
	dsn := "postgresql://neondb_owner:npg_QtJ4xXKy3Fmo@ep-spring-scene-amchbrn8-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to connect to database: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(ctx)

	// Check table columns of shifts
	rows, err := conn.Query(ctx, `
		SELECT column_name, data_type 
		FROM information_schema.columns 
		WHERE table_name = 'shifts'
	`)
	if err == nil {
		fmt.Println("Shifts table columns:")
		for rows.Next() {
			var colName, dataType string
			if rows.Scan(&colName, &dataType) == nil {
				fmt.Printf("  %s (%s)\n", colName, dataType)
			}
		}
		rows.Close()
	}

	// Check existing shifts
	rows2, err := conn.Query(ctx, "SELECT id, shift_name FROM shifts LIMIT 10")
	if err == nil {
		fmt.Println("Shifts in DB:")
		for rows2.Next() {
			var id int
			var name string
			if rows2.Scan(&id, &name) == nil {
				fmt.Printf("  ID: %d, Name: %s\n", id, name)
			}
		}
		rows2.Close()
	}
}
