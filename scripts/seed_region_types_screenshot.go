//go:build ignore
// +build ignore

package main

import (
	"context"
	"fmt"
	"gps-tracking-system/internal/config"
	"gps-tracking-system/internal/repository"
	"log"
)

func main() {
	fmt.Println("Connecting to DB...")
	cfg := config.LoadConfig()
	db, err := repository.InitDB(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to DB: %v", err)
	}
	defer db.Close()

	ctx := context.Background()

	// 1. Create region_types table if it somehow got altered, but it should exist
	// 2. Clear existing region_types or update them
	// We'll update the existing ones to make sure they match the hierarchy:
	// - City (id=1) -> Parent: NULL
	// - Zone (id=2) -> Parent: 1 (City)
	// - Ward (id=3) -> Parent: 2 (Zone)

	fmt.Println("Updating existing region types (City, Zone, Ward)...")
	_, err = db.Exec(ctx, `
		INSERT INTO region_types (id, title, parent_id) VALUES (1, 'City', NULL)
		ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, parent_id = EXCLUDED.parent_id
	`)
	if err != nil {
		log.Fatalf("Failed to upsert City: %v", err)
	}

	_, err = db.Exec(ctx, `
		INSERT INTO region_types (id, title, parent_id) VALUES (2, 'Zone', 1)
		ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, parent_id = EXCLUDED.parent_id
	`)
	if err != nil {
		log.Fatalf("Failed to upsert Zone: %v", err)
	}

	_, err = db.Exec(ctx, `
		INSERT INTO region_types (id, title, parent_id) VALUES (3, 'Ward', 2)
		ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, parent_id = EXCLUDED.parent_id
	`)
	if err != nil {
		log.Fatalf("Failed to upsert Ward: %v", err)
	}

	// 3. Insert Special Departments, Special Areas, Other Collection Areas
	fmt.Println("Inserting Special Departments...")
	_, err = db.Exec(ctx, `
		INSERT INTO region_types (id, title, parent_id) VALUES (4, 'Special Departments', 1)
		ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, parent_id = EXCLUDED.parent_id
	`)
	if err != nil {
		log.Fatalf("Failed to insert Special Departments: %v", err)
	}

	fmt.Println("Inserting Special Areas...")
	_, err = db.Exec(ctx, `
		INSERT INTO region_types (id, title, parent_id) VALUES (5, 'Special Areas', 2)
		ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, parent_id = EXCLUDED.parent_id
	`)
	if err != nil {
		log.Fatalf("Failed to insert Special Areas: %v", err)
	}

	fmt.Println("Inserting Other Collection Areas...")
	_, err = db.Exec(ctx, `
		INSERT INTO region_types (id, title, parent_id) VALUES (6, 'Other Collection Areas', 4)
		ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, parent_id = EXCLUDED.parent_id
	`)
	if err != nil {
		log.Fatalf("Failed to insert Other Collection Areas: %v", err)
	}

	// 4. Update the ID sequence for region_types so future auto-increment works from 7 onwards
	_, err = db.Exec(ctx, `SELECT setval('region_types_id_seq', (SELECT MAX(id) FROM region_types))`)
	if err != nil {
		log.Printf("Warning: Failed to update sequence: %v", err)
	}

	fmt.Println("Database seeded successfully with the screenshot's region types hierarchy!")
}
