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
	if dsn == "" {
		fmt.Println("DB_DSN environment variable not set")
		return
	}

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		fmt.Printf("Unable to connect to database: %v\n", err)
		return
	}
	defer conn.Close(ctx)

	fmt.Println("Connected to PostgreSQL database!")

	// 1. List all tables
	rows, err := conn.Query(ctx, `
		SELECT table_name 
		FROM information_schema.tables 
		WHERE table_schema = 'public' 
		ORDER BY table_name;
	`)
	if err != nil {
		fmt.Printf("Error querying tables: %v\n", err)
		return
	}
	defer rows.Close()

	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err == nil {
			tables = append(tables, name)
		}
	}
	fmt.Printf("\nTables found: %v\n", tables)

	// 2. Describe columns and get sample count for each table
	for _, table := range tables {
		var count int64
		_ = conn.QueryRow(ctx, fmt.Sprintf("SELECT COUNT(*) FROM %s", table)).Scan(&count)
		fmt.Printf("\nTable: %s (Rows: %d)\n", table, count)

		colRows, err := conn.Query(ctx, fmt.Sprintf(`
			SELECT column_name, data_type 
			FROM information_schema.columns 
			WHERE table_name = '%s'
			ORDER BY ordinal_position;
		`, table))
		if err != nil {
			fmt.Printf("  Error query columns for %s: %v\n", table, err)
			continue
		}
		
		fmt.Print("  Columns: ")
		for colRows.Next() {
			var colName, dataType string
			if err := colRows.Scan(&colName, &dataType); err == nil {
				fmt.Printf("%s (%s), ", colName, dataType)
			}
		}
		colRows.Close()
		fmt.Println()
	}
}
