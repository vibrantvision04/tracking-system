package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
)

func main() {
	godotenv.Load()
	dsn := os.Getenv("DB_DSN")
	if dsn == "" {
		fmt.Println("DB_DSN not found in .env")
		os.Exit(1)
	}

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		fmt.Printf("Unable to connect to database: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(ctx)

	fmt.Println("Connected to Neon database. Running migrations...")

	migrationDir := "migrations"
	files, err := os.ReadDir(migrationDir)
	if err != nil {
		fmt.Printf("Unable to read migrations directory: %v\n", err)
		os.Exit(1)
	}

	var filenames []string
	for _, f := range files {
		if !f.IsDir() && strings.HasSuffix(f.Name(), ".sql") {
			filenames = append(filenames, f.Name())
		}
	}
	sort.Strings(filenames)

	for _, filename := range filenames {
		fmt.Printf("Applying %s...\n", filename)
		contentBytes, err := os.ReadFile(filepath.Join(migrationDir, filename))
		if err != nil {
			fmt.Printf("Error reading %s: %v\n", filename, err)
			continue
		}
		content := string(contentBytes)

		// TimescaleDB extension might not be supported on Neon
		if filename == "002_timescale_setup.sql" {
			fmt.Println("Removing TimescaleDB specific commands but keeping table creation...")
			// Extract CREATE TABLE and skip the rest
			lines := strings.Split(content, "\n")
			var filteredLines []string
			inTable := false
			for _, line := range lines {
				if strings.Contains(line, "CREATE TABLE IF NOT EXISTS gps_data") {
					inTable = true
				}
				if inTable {
					filteredLines = append(filteredLines, line)
					if strings.Contains(line, ");") {
						inTable = false
					}
				}
			}
			content = strings.Join(filteredLines, "\n")
		}

		_, err = conn.Exec(ctx, content)
		if err != nil {
			fmt.Printf("Error applying %s: %v\n", filename, err)
		}
	}

	fmt.Println("Migrations finished.")
}
