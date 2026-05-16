//go:build ignore
// +build ignore

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"gps-tracking-system/internal/config"
	"gps-tracking-system/internal/repository"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

type RegionData struct {
	ID                  int    `json:"id"`
	RegionName          string `json:"region_name"`
	GeofenceID          int    `json:"geofence_id"`
	ParentID            int    `json:"parent_id"`
	RegionCode          string `json:"region_code"`
	EstimatedPopulation int    `json:"estimated_population"`
	RegionTypeID        int    `json:"region_type_id"`
}

type FileData struct {
	Data []RegionData `json:"data"`
}

func main() {
	fmt.Println("1. Loading Config and Connecting to DB...")
	cfg := config.LoadConfig()
	db, err := repository.InitDB(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to DB: %v", err)
	}
	defer db.Close()

	ctx := context.Background()

	// Insert Region Types first if not exist
	// 1: City, 2: Zone, 3: Ward
	_, err = db.Exec(ctx, `
		INSERT INTO region_types (id, title) VALUES 
		(1, 'City'), (2, 'Zone'), (3, 'Ward')
		ON CONFLICT (id) DO NOTHING
	`)
	if err != nil {
		log.Printf("Warning: Failed to insert region types: %v", err)
	}

	// Seed Zones
	fmt.Println("2. Seeding Zones...")
	seedFile(ctx, db, "iswm zone data.json")

	// Seed Wards
	fmt.Println("3. Seeding Wards...")
	seedFile(ctx, db, "swimwarddata.json")

	// Update sequence
	_, err = db.Exec(ctx, `SELECT setval('regions_id_seq', (SELECT MAX(id) FROM regions))`)
	if err != nil {
		log.Printf("Warning: Failed to update sequence: %v", err)
	}

	fmt.Println("Done!")
}

func seedFile(ctx context.Context, db *pgxpool.Pool, filename string) {
	data, err := os.ReadFile(filename)
	if err != nil {
		log.Printf("Failed to read file %s: %v", filename, err)
		return
	}

	var fileData FileData
	if err := json.Unmarshal(data, &fileData); err != nil {
		log.Printf("Failed to parse file %s: %v", filename, err)
		return
	}

	for _, r := range fileData.Data {
		query := `
			INSERT INTO regions (id, region_name, geofence_id, parent_id, region_code, estimated_population, region_type_id)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			ON CONFLICT (id) DO UPDATE SET
			region_name = EXCLUDED.region_name,
			geofence_id = EXCLUDED.geofence_id,
			parent_id = EXCLUDED.parent_id,
			region_code = EXCLUDED.region_code,
			estimated_population = EXCLUDED.estimated_population,
			region_type_id = EXCLUDED.region_type_id
		`
		
		// Handle null parent_id
		var parentID interface{} = r.ParentID
		if r.ParentID == 0 {
			parentID = nil
		}

		_, err := db.Exec(ctx, query, r.ID, r.RegionName, r.GeofenceID, parentID, r.RegionCode, r.EstimatedPopulation, r.RegionTypeID)
		if err != nil {
			log.Printf("Failed to insert region %d (%s): %v", r.ID, r.RegionName, err)
		}
	}
	fmt.Printf("   Seeded %d records from %s\n", len(fileData.Data), filename)
}
