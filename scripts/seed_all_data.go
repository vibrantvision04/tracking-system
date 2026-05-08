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

type ISWMRegion struct {
	ID         int    `json:"id"`
	RegionName string `json:"region_name"`
	ParentID   int    `json:"parent_id"`
}

type EcoSenseZone struct {
	ID   string `json:"_id"`
	Name string `json:"name"`
}

type EcoSenseWard struct {
	ID     string `json:"_id"`
	Number string `json:"number"`
	ZoneID struct {
		ID string `json:"_id"`
	} `json:"zoneId"`
}

func main() {
	fmt.Println("Connecting to DB...")
	cfg := config.LoadConfig()
	db, err := repository.InitDB(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to DB: %v", err)
	}
	defer db.Close()

	ctx := context.Background()

	// 1. Add external_id column if not exists
	_, err = db.Exec(ctx, "ALTER TABLE regions ADD COLUMN IF NOT EXISTS external_id TEXT")
	if err != nil {
		log.Printf("Warning: Failed to add external_id column: %v", err)
	}

	// 2. Clear existing regions to avoid conflicts
	_, err = db.Exec(ctx, "DELETE FROM regions")
	if err != nil {
		log.Printf("Warning: Failed to clear regions: %v", err)
	}

	mongoIdToDbId := make(map[string]int)

	// 3. Seed ISWM Zones
	fmt.Println("Seeding ISWM Zones...")
	seedISWM(ctx, db, "iswm zone data.json", 2, mongoIdToDbId) // Type 2 = Zone

	// 4. Seed ISWM Wards
	fmt.Println("Seeding ISWM Wards...")
	seedISWM(ctx, db, "swimwarddata.json", 3, mongoIdToDbId) // Type 3 = Ward

	// 5. Seed EcoSense Zones
	fmt.Println("Seeding EcoSense Zones...")
	seedEcoSenseZones(ctx, db, "ecosence zonedata  copy.json", mongoIdToDbId)

	// 6. Seed EcoSense Wards
	fmt.Println("Seeding EcoSense Wards...")
	seedEcoSenseWards(ctx, db, "ecosence warddata .json", mongoIdToDbId)

	// Update sequence
	_, err = db.Exec(ctx, `SELECT setval('regions_id_seq', (SELECT MAX(id) FROM regions))`)
	if err != nil {
		log.Printf("Warning: Failed to update sequence: %v", err)
	}

	fmt.Println("Done seeding all regions!")
}

func seedISWM(ctx context.Context, db *pgxpool.Pool, filename string, typeID int, mongoMap map[string]int) {
	data, err := os.ReadFile(filename)
	if err != nil {
		log.Printf("Failed to read %s: %v", filename, err)
		return
	}

	var result struct {
		Data []ISWMRegion `json:"data"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		log.Printf("Failed to parse %s: %v", filename, err)
		return
	}

	for _, r := range result.Data {
		var parentID interface{} = r.ParentID
		if r.ParentID == 0 {
			parentID = nil
		}

		query := `
			INSERT INTO regions (id, region_name, parent_id, region_type_id)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (id) DO UPDATE SET
			region_name = EXCLUDED.region_name,
			parent_id = EXCLUDED.parent_id,
			region_type_id = EXCLUDED.region_type_id
		`
		_, err := db.Exec(ctx, query, r.ID, r.RegionName, parentID, typeID)
		if err != nil {
			log.Printf("Failed to insert ISWM region %d: %v", r.ID, err)
		}
	}
	fmt.Printf("   Seeded %d records from %s\n", len(result.Data), filename)
}

func seedEcoSenseZones(ctx context.Context, db *pgxpool.Pool, filename string, mongoMap map[string]int) {
	data, err := os.ReadFile(filename)
	if err != nil {
		log.Printf("Failed to read %s: %v", filename, err)
		return
	}

	var result struct {
		Data []EcoSenseZone `json:"data"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		log.Printf("Failed to parse %s: %v", filename, err)
		return
	}

	for _, r := range result.Data {
		var id int
		query := `
			INSERT INTO regions (region_name, region_type_id, external_id)
			VALUES ($1, $2, $3)
			RETURNING id
		`
		err := db.QueryRow(ctx, query, r.Name, 2, r.ID).Scan(&id) // Type 2 = Zone
		if err != nil {
			log.Printf("Failed to insert EcoSense zone %s: %v", r.Name, err)
			continue
		}
		mongoMap[r.ID] = id
	}
	fmt.Printf("   Seeded %d records from %s\n", len(result.Data), filename)
}

func seedEcoSenseWards(ctx context.Context, db *pgxpool.Pool, filename string, mongoMap map[string]int) {
	data, err := os.ReadFile(filename)
	if err != nil {
		log.Printf("Failed to read %s: %v", filename, err)
		return
	}

	var result struct {
		Data []EcoSenseWard `json:"data"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		log.Printf("Failed to parse %s: %v", filename, err)
		return
	}

	for _, r := range result.Data {
		parentID, ok := mongoMap[r.ZoneID.ID]
		var pID interface{} = parentID
		if !ok {
			pID = nil
		}

		query := `
			INSERT INTO regions (region_name, parent_id, region_type_id, external_id)
			VALUES ($1, $2, $3, $4)
		`
		_, err := db.Exec(ctx, query, "Ward - "+r.Number, pID, 3, r.ID) // Type 3 = Ward
		if err != nil {
			log.Printf("Failed to insert EcoSense ward %s: %v", r.Number, err)
		}
	}
	fmt.Printf("   Seeded %d records from %s\n", len(result.Data), filename)
}
