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

// migrate_all applies SQL migrations from the migrations/ directory.
//
// It tracks applied migrations in a schema_migrations table so that:
//   - migrations run exactly once (re-runs on container restart are no-ops),
//   - a non-idempotent migration can never take down the server on restart.
//
// Baseline behaviour: if schema_migrations does not yet exist but the database
// already contains application tables (i.e. an existing, already-migrated DB),
// every current migration file is recorded as "applied" WITHOUT being re-run.
// This safely transitions a previously-working database onto the new tracking
// scheme without replaying old, possibly non-idempotent migrations.
func main() {
	dsn := os.Getenv("DB_DSN")
	if dsn == "" {
		dsn = "postgres://gps:password@localhost:5432/gpsdb"
	}

	ctx := context.Background()
	var conn *pgx.Conn
	var err error

	// Retry database connection with backoff to handle container boot delays.
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

	// Read and sort migration files.
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

	// Determine whether the tracking table already exists (before we create it).
	var trackingExisted bool
	if err := conn.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_migrations')`,
	).Scan(&trackingExisted); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to inspect schema_migrations: %v\n", err)
		os.Exit(1)
	}

	// Ensure the tracking table exists.
	if _, err := conn.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			filename   TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)
	`); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create schema_migrations table: %v\n", err)
		os.Exit(1)
	}

	// Load already-applied migrations.
	applied := map[string]bool{}
	rows, err := conn.Query(ctx, `SELECT filename FROM schema_migrations`)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to read schema_migrations: %v\n", err)
		os.Exit(1)
	}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err == nil {
			applied[name] = true
		}
	}
	rows.Close()

	// Baseline: first run of the tracker on an already-populated database.
	// Detect an existing schema via a well-known application table.
	//
	// Migrations listed in baselineExclude were introduced together with (or
	// after) this tracking system, so an existing database has NOT applied them
	// yet. They must NOT be baselined — they run as normal pending migrations.
	baselineExclude := map[string]bool{
		"067_operational_roles_designations.sql": true,
	}

	if !trackingExisted && len(applied) == 0 {
		var hasExistingSchema bool
		_ = conn.QueryRow(ctx,
			`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users')`,
		).Scan(&hasExistingSchema)

		if hasExistingSchema {
			baselined := 0
			for _, fileName := range sqlFiles {
				if baselineExclude[fileName] {
					continue // leave unmarked so it runs as a pending migration below
				}
				if _, err := conn.Exec(ctx,
					`INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`,
					fileName,
				); err != nil {
					fmt.Fprintf(os.Stderr, "Failed to baseline migration %s: %v\n", fileName, err)
					os.Exit(1)
				}
				applied[fileName] = true
				baselined++
			}
			fmt.Printf("Existing database detected — baselined %d migration(s) as already applied.\n", baselined)
		}
	}

	// Apply any pending migrations, each in its own transaction.
	pending := 0
	for _, fileName := range sqlFiles {
		if applied[fileName] {
			continue
		}
		pending++

		filePath := filepath.Join("migrations", fileName)
		fmt.Printf("Applying migration: %s\n", filePath)

		content, err := os.ReadFile(filePath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Unable to read SQL file %s: %v\n", filePath, err)
			os.Exit(1)
		}

		tx, err := conn.Begin(ctx)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to begin transaction for %s: %v\n", filePath, err)
			os.Exit(1)
		}

		if _, err := tx.Exec(ctx, string(content)); err != nil {
			_ = tx.Rollback(ctx)
			fmt.Fprintf(os.Stderr, "Migration failed for %s: %v\n", filePath, err)
			os.Exit(1)
		}

		if _, err := tx.Exec(ctx,
			`INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`,
			fileName,
		); err != nil {
			_ = tx.Rollback(ctx)
			fmt.Fprintf(os.Stderr, "Failed to record migration %s: %v\n", fileName, err)
			os.Exit(1)
		}

		if err := tx.Commit(ctx); err != nil {
			fmt.Fprintf(os.Stderr, "Failed to commit migration %s: %v\n", filePath, err)
			os.Exit(1)
		}
	}

	if pending == 0 {
		fmt.Println("No pending migrations — schema is up to date.")
	} else {
		fmt.Printf("Applied %d pending migration(s) successfully!\n", pending)
	}
}
