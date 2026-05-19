package main

import (
	"context"
	"fmt"
	"math"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
)

type GPSPoint struct {
	CapturedAt time.Time
	Lat        float64
	Lng        float64
	Speed      int
	Ignition   int
}

func main() {
	_ = godotenv.Load(".env")
	dsn := os.Getenv("DB_DSN")
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		fmt.Printf("Unable to connect to database: %v\n", err)
		return
	}
	defer conn.Close(ctx)

	// Fetch all gps_data for the IMEI ordered by captured_at
	imei := "350317172709754"
	rows, err := conn.Query(ctx, `
		SELECT captured_at, lat, lng, speed, ignition 
		FROM gps_data 
		WHERE imei = $1 AND lat != 0 AND lng != 0
		ORDER BY captured_at ASC
	`, imei)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}
	defer rows.Close()

	var points []GPSPoint
	for rows.Next() {
		var p GPSPoint
		var speedVal int16
		var ignitionVal int16
		_ = rows.Scan(&p.CapturedAt, &p.Lat, &p.Lng, &speedVal, &ignitionVal)
		p.Speed = int(speedVal)
		p.Ignition = int(ignitionVal)
		points = append(points, p)
	}

	fmt.Printf("Total valid GPS points: %d\n", len(points))
	if len(points) == 0 {
		return
	}

	const minStoppageSec = 10.0 // 10 seconds
	const maxDriftRadiusKm = 0.05 // 50 meters

	stoppageStartIdx := -1
	for i := 0; i < len(points); i++ {
		isStopped := points[i].Speed == 0

		if isStopped {
			if stoppageStartIdx == -1 {
				stoppageStartIdx = i
			} else {
				// Check distance from start
				dist := haversine(points[stoppageStartIdx].Lat, points[stoppageStartIdx].Lng, points[i].Lat, points[i].Lng)
				if dist > maxDriftRadiusKm {
					dur := points[i-1].CapturedAt.Sub(points[stoppageStartIdx].CapturedAt).Seconds()
					if dur >= minStoppageSec {
						fmt.Printf("Stoppage: Start %v | End %v | Duration: %.1f mins (%.0f sec) | Lat: %f, Lng: %f\n",
							points[stoppageStartIdx].CapturedAt.Format("2006-01-02 15:04:05"),
							points[i-1].CapturedAt.Format("2006-01-02 15:04:05"),
							dur/60.0,
							dur,
							points[stoppageStartIdx].Lat,
							points[stoppageStartIdx].Lng,
						)
					}
					stoppageStartIdx = i
				}
			}
		} else {
			if stoppageStartIdx != -1 {
				dur := points[i-1].CapturedAt.Sub(points[stoppageStartIdx].CapturedAt).Seconds()
				if dur >= minStoppageSec {
					fmt.Printf("Stoppage: Start %v | End %v | Duration: %.1f mins (%.0f sec) | Lat: %f, Lng: %f\n",
						points[stoppageStartIdx].CapturedAt.Format("2006-01-02 15:04:05"),
						points[i-1].CapturedAt.Format("2006-01-02 15:04:05"),
						dur/60.0,
						dur,
						points[stoppageStartIdx].Lat,
						points[stoppageStartIdx].Lng,
					)
				}
				stoppageStartIdx = -1
			}
		}
	}

	if stoppageStartIdx != -1 {
		dur := points[len(points)-1].CapturedAt.Sub(points[stoppageStartIdx].CapturedAt).Seconds()
		if dur >= minStoppageSec {
			fmt.Printf("Active/Final Stoppage: Start %v | End %v | Duration: %.1f mins (%.0f sec) | Lat: %f, Lng: %f\n",
				points[stoppageStartIdx].CapturedAt.Format("2006-01-02 15:04:05"),
				points[len(points)-1].CapturedAt.Format("2006-01-02 15:04:05"),
				dur/60.0,
				dur,
				points[stoppageStartIdx].Lat,
				points[stoppageStartIdx].Lng,
			)
		}
	}
}

// Haversine formula
func haversine(lat1, lon1, lat2, lon2 float64) float64 {
	const r = 6371.0 // Earth radius in km
	dLat := (lat2 - lat1) * math.Pi / 180.0
	dLon := (lon2 - lon1) * math.Pi / 180.0
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180.0)*math.Cos(lat2*math.Pi/180.0)*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return r * c
}
