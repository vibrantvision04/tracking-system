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

	// 1. Alter routes table
	_, err = conn.Exec(ctx, `
		ALTER TABLE routes ADD COLUMN IF NOT EXISTS ward_id INT;
		ALTER TABLE routes ADD COLUMN IF NOT EXISTS shift_id INT;
		ALTER TABLE routes ADD COLUMN IF NOT EXISTS lanes JSONB DEFAULT '[]'::jsonb;
	`)
	if err != nil {
		fmt.Printf("Error altering routes table: %v\n", err)
		return
	}
	fmt.Println("Altered routes table successfully.")

	// 2. Seed shifts if empty
	var count int
	err = conn.QueryRow(ctx, "SELECT count(*) FROM shifts").Scan(&count)
	if err != nil {
		fmt.Printf("Error counting shifts: %v\n", err)
		return
	}

	if count == 0 {
		_, err = conn.Exec(ctx, `
			INSERT INTO shifts (shift_name, start_time, end_time, time_duration) VALUES
			('Morning', '06:30:00', '15:30:00', 9),
			('Evening', '14:00:00', '22:00:00', 8)
		`)
		if err != nil {
			fmt.Printf("Error seeding shifts: %v\n", err)
			return
		}
		fmt.Println("Seeded shifts successfully.")
	} else {
		fmt.Println("Shifts already seeded.")
	}

	// 3. Seed some dummy routes to start with if empty
	var routesCount int
	err = conn.QueryRow(ctx, "SELECT count(*) FROM routes").Scan(&routesCount)
	if err == nil && routesCount == 0 {
		// Get a ward id
		var wardId int
		err = conn.QueryRow(ctx, "SELECT id FROM regions WHERE region_type_id = 3 LIMIT 1").Scan(&wardId)
		if err == nil {
			_, err = conn.Exec(ctx, `
				INSERT INTO routes (route_name, identification, distance, route_type_id, geometry_id, ward_id, shift_id, lanes)
				VALUES 
				('Morning_RJ14GN7616', 'Tilak Path, Patrkar, etc', 16.31, 1, NULL, $1, 1, '[]'::jsonb),
				('Morning_RJ14GT7547', 'Khatipura, Vaishali, etc', 5.05, 1, NULL, $1, 1, '[]'::jsonb)
			`, wardId)
			if err == nil {
				fmt.Println("Seeded dummy routes successfully.")
			}
		}
	}
}
