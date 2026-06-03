//go:build ignore
// +build ignore

package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

func main() {
	dsn := os.Getenv("DB_DSN")
	if dsn == "" {
		dsn = "postgres://gps:password@localhost:5432/gpsdb"
	}

	ctx := context.Background()
	var conn *pgx.Conn
	var err error
	
	// Retry database connection with backoff to handle container boot delays
	for i := 0; i < 15; i++ {
		conn, err = pgx.Connect(ctx, dsn)
		if err == nil {
			break
		}
		fmt.Printf("Database connection failed (attempt %d/15): %v. Retrying in 2 seconds...\n", i+1, err)
		time.Sleep(2 * time.Second)
	}
	
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to connect to database: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(ctx)

	files, err := os.ReadDir("migrations")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to read migrations directory: %v\n", err)
		os.Exit(1)
	}

	var sqlFiles []string
	for _, f := range files {
		if !f.IsDir() && strings.HasSuffix(f.Name(), ".sql") {
			sqlFiles = append(sqlFiles, f.Name())
		}
	}
	sort.Strings(sqlFiles)

	for _, fileName := range sqlFiles {
		filePath := filepath.Join("migrations", fileName)
		fmt.Printf("Applying migration: %s\n", filePath)
		
		content, err := os.ReadFile(filePath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Unable to read SQL file %s: %v\n", filePath, err)
			os.Exit(1)
		}

		_, err = conn.Exec(ctx, string(content))
		if err != nil {
			fmt.Fprintf(os.Stderr, "Migration failed for %s: %v\n", filePath, err)
			// Continue or exit? For now exit to be safe.
			os.Exit(1)
		}
	}

	fmt.Println("All migrations applied successfully!")
}
