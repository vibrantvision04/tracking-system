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

	tx, err := conn.Begin(ctx)
	if err != nil {
		fmt.Printf("Failed to begin transaction: %v\n", err)
		return
	}
	defer tx.Rollback(ctx)

	// 1. Ensure region_types exist
	_, err = tx.Exec(ctx, `
		INSERT INTO region_types (id, title) VALUES
		(1, 'City'),
		(2, 'Zone'),
		(3, 'Ward')
		ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title
	`)
	if err != nil {
		fmt.Printf("Failed to insert region types: %v\n", err)
		return
	}

	// 2. Insert Zone 1
	zoneID := 1
	_, err = tx.Exec(ctx, `
		INSERT INTO regions (id, region_name, region_type_id, parent_id)
		VALUES ($1, 'Zone 1 - Hawa Mahal-Aamer Zone', 2, NULL)
		ON CONFLICT (id) DO UPDATE SET region_name = EXCLUDED.region_name
	`, zoneID)
	if err != nil {
		fmt.Printf("Failed to insert zone: %v\n", err)
		return
	}

	// 3. Insert Wards 1 to 30, and Ward 150
	for i := 1; i <= 30; i++ {
		wardID := i + 10 // Let's offset ward IDs to avoid conflicts or use explicit IDs
		wardName := fmt.Sprintf("%d - Ward - %d", i, i)
		_, err = tx.Exec(ctx, `
			INSERT INTO regions (id, region_name, region_type_id, parent_id)
			VALUES ($1, $2, 3, $3)
			ON CONFLICT (id) DO UPDATE SET region_name = EXCLUDED.region_name
		`, wardID, wardName, zoneID)
		if err != nil {
			fmt.Printf("Failed to insert ward %d: %v\n", i, err)
			return
		}
	}

	// Insert Ward 150
	ward150ID := 150 + 10
	_, err = tx.Exec(ctx, `
		INSERT INTO regions (id, region_name, region_type_id, parent_id)
		VALUES ($1, '150 - Ward - 150', 3, $2)
		ON CONFLICT (id) DO UPDATE SET region_name = EXCLUDED.region_name
	`, ward150ID, zoneID)
	if err != nil {
		fmt.Printf("Failed to insert ward 150: %v\n", err)
		return
	}

	// 4. Map Vehicles to Zone and Ward
	// Vehicle 1245 -> Ward 23 (ID = 23 + 10 = 33)
	// Vehicle 1246 -> Ward 15 (ID = 15 + 10 = 25)
	_, err = tx.Exec(ctx, "UPDATE vehicles SET zone_id = 1, ward_id = 33 WHERE id = 1245")
	if err != nil {
		fmt.Printf("Failed to update vehicle 1245: %v\n", err)
		return
	}

	_, err = tx.Exec(ctx, "UPDATE vehicles SET zone_id = 1, ward_id = 25 WHERE id = 1246")
	if err != nil {
		fmt.Printf("Failed to update vehicle 1246: %v\n", err)
		return
	}

	err = tx.Commit(ctx)
	if err != nil {
		fmt.Printf("Failed to commit transaction: %v\n", err)
		return
	}

	fmt.Println("Successfully seeded regions (Zone 1, Wards 1-30, Ward 150) and updated vehicle mappings in Neon PostgreSQL!")
}
