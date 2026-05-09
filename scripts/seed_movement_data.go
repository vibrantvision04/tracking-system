package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

type MovementJSON struct {
	Data []struct {
		RegistrationNo string `json:"registration_no"`
		Regions        []struct {
			ID int `json:"id"`
		} `json:"regions"`
		SubRegions []struct {
			ID int `json:"id"`
		} `json:"sub_regions"`
		MovementReports []struct {
			ID                       int64   `json:"id"`
			ReportDate               string  `json:"report_date"`
			AverageSpeed             float64 `json:"average_speed"`
			TotalDistance            float64 `json:"total_distance"`
			StartTime                string  `json:"start_time"`
			EndTime                  string  `json:"end_time"`
			TotalActiveDuration      string  `json:"total_active_duration"`
			TotalIdleDuration        string  `json:"total_idle_duration"`
			TotalStoppageDuration    string  `json:"total_stoppage_duration"`
			ActualIgnitionOnDuration string  `json:"actual_ignition_on_duration"`
			TotalIgnitionOnDuration  string  `json:"total_ignition_on_duration"`
			Alert                    int     `json:"alert"`
			StartPoint               struct {
				X float64 `json:"x"`
				Y float64 `json:"y"`
			} `json:"start_point"`
			EndPoint struct {
				X float64 `json:"x"`
				Y float64 `json:"y"`
			} `json:"end_point"`
		} `json:"movement_reports"`
	} `json:"data"`
}

func main() {
	log.Println("Starting to seed movement data from JSON to DB...")

	// Load environment variables
	godotenv.Load() // Loads .env from current directory by default

	dbURL := os.Getenv("DB_DSN")
	if dbURL == "" {
		dbURL = os.Getenv("DATABASE_URL") // Fallback
	}
	if dbURL == "" {
		log.Fatal("Neither DB_DSN nor DATABASE_URL environment variable is set")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v", err)
	}
	defer pool.Close()

	// 1. Add columns to vehicles table if they don't exist
	log.Println("Adding zone_id and ward_id columns to vehicles table if missing...")
	_, err = pool.Exec(ctx, `
		ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS zone_id INT;
		ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ward_id INT;
	`)
	if err != nil {
		log.Fatalf("Failed to add columns to vehicles table: %v", err)
	}

	// 2. Load vehicles from DB to map registration_no to ID and IMEI
	log.Println("Loading vehicles from DB...")
	rows, err := pool.Query(ctx, `
		SELECT v.id, v.registration_no, COALESCE(d.imei, '') 
		FROM vehicles v
		LEFT JOIN vehicle_gps_map m ON v.id = m.vehicle_id AND m.unassigned_at IS NULL
		LEFT JOIN gps_devices d ON m.device_id = d.id
	`)
	if err != nil {
		log.Fatalf("Failed to query vehicles: %v", err)
	}
	defer rows.Close()

	type VehicleInfo struct {
		ID   int
		IMEI string
	}
	vehicleMap := make(map[string]VehicleInfo)
	for rows.Next() {
		var id int
		var reg, imei string
		if err := rows.Scan(&id, &reg, &imei); err != nil {
			log.Fatalf("Failed to scan vehicle: %v", err)
		}
		vehicleMap[reg] = VehicleInfo{ID: id, IMEI: imei}
	}

	// 3. Read JSON file
	filePath := "E:\\dataswim\\iswmmovement.json"
	log.Printf("Reading JSON file from %s...", filePath)
	data, err := os.ReadFile(filePath)
	if err != nil {
		log.Fatalf("Failed to read JSON file: %v", err)
	}

	var result MovementJSON
	if err := json.Unmarshal(data, &result); err != nil {
		log.Fatalf("Failed to parse JSON: %v", err)
	}

	log.Printf("Found %d vehicles in JSON. Processing...", len(result.Data))

	// 4. Process data
	insertedReports := 0
	updatedVehicles := 0

	for _, v := range result.Data {
		vInfo, exists := vehicleMap[v.RegistrationNo]
		if !exists {
			// Skip if vehicle doesn't exist in our DB
			continue
		}

		// Update vehicle with zone and ward
		var zoneID, wardID *int
		if len(v.Regions) > 0 {
			val := v.Regions[0].ID
			zoneID = &val
		}
		if len(v.SubRegions) > 0 {
			val := v.SubRegions[0].ID
			wardID = &val
		}

		if zoneID != nil || wardID != nil {
			_, err = pool.Exec(ctx, `
				UPDATE vehicles SET zone_id = $1, ward_id = $2 WHERE id = $3
			`, zoneID, wardID, vInfo.ID)
			if err != nil {
				log.Printf("Failed to update vehicle %s: %v", v.RegistrationNo, err)
			} else {
				updatedVehicles++
			}
		}

		// Insert reports
		for _, rep := range v.MovementReports {
			// Skip if no IMEI mapped (reports table usually requires imei for conflict check)
			if vInfo.IMEI == "" {
				continue
			}

			startPointJSON := fmt.Sprintf("{\"lng\": %f, \"lat\": %f}", rep.StartPoint.X, rep.StartPoint.Y)
			endPointJSON := fmt.Sprintf("{\"lng\": %f, \"lat\": %f}", rep.EndPoint.X, rep.EndPoint.Y)

			reportDate, _ := time.Parse("2006-01-02", rep.ReportDate)
			startTime, _ := time.Parse("2006-01-02 15:04:05", rep.StartTime)
			endTime, _ := time.Parse("2006-01-02 15:04:05", rep.EndTime)

			_, err = pool.Exec(ctx, `
				INSERT INTO movement_reports 
				(imei, vehicle_id, report_date, average_speed, total_distance, start_point, end_point, 
				 start_time, end_time, alert, total_active_duration, total_idle_duration, 
				 total_stoppage_duration, in_parking_duration, actual_ignition_on_duration, 
				 total_ignition_on_duration)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
				ON CONFLICT (imei, report_date) DO UPDATE SET
				average_speed = EXCLUDED.average_speed,
				total_distance = EXCLUDED.total_distance,
				start_point = EXCLUDED.start_point,
				end_point = EXCLUDED.end_point,
				start_time = EXCLUDED.start_time,
				end_time = EXCLUDED.end_time,
				alert = EXCLUDED.alert
			`,
				vInfo.IMEI, vInfo.ID, reportDate, rep.AverageSpeed, rep.TotalDistance, startPointJSON, endPointJSON,
				startTime, endTime, rep.Alert, rep.TotalActiveDuration, rep.TotalIdleDuration,
				rep.TotalStoppageDuration, "00:00:00", rep.ActualIgnitionOnDuration,
				rep.TotalIgnitionOnDuration,
			)

			if err != nil {
				log.Printf("Failed to insert report for %s on %s: %v", v.RegistrationNo, rep.ReportDate, err)
			} else {
				insertedReports++
			}
		}
	}

	log.Printf("Successfully updated %d vehicles with zone/ward.", updatedVehicles)
	log.Printf("Successfully inserted/updated %d movement reports.", insertedReports)
	log.Println("Done!")
}
