package service

import (
	"context"
	"fmt"
	"gps-tracking-system/internal/decoder"
	"gps-tracking-system/internal/repository"
	"gps-tracking-system/internal/utils"
	"time"
)

type ReportService struct {
	repo  *repository.ReportRepository
	gRepo *repository.GPSRepository
	vRepo *repository.VehicleRepository
}

func NewReportService(repo *repository.ReportRepository, gRepo *repository.GPSRepository, vRepo *repository.VehicleRepository) *ReportService {
	return &ReportService{
		repo:  repo,
		gRepo: gRepo,
		vRepo: vRepo,
	}
}


func (s *ReportService) GenerateDailyReport(ctx context.Context, vehicleID int, date time.Time, zone, ward string) error {
	start := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())
	end := start.Add(24 * time.Hour)

	// Auto-lookup zone and ward if not provided
	var zoneName, wardName string
	err := s.gRepo.Pool().QueryRow(ctx, `
		SELECT COALESCE(z.region_name, ''), COALESCE(w.region_name, '')
		FROM vehicles v
		LEFT JOIN regions z ON v.zone_id = z.id
		LEFT JOIN regions w ON v.ward_id = w.id
		WHERE v.id = $1
	`, vehicleID).Scan(&zoneName, &wardName)
	if err == nil {
		if zone == "" {
			zone = zoneName
		}
		if ward == "" {
			ward = wardName
		}
	}

	// Fetch GPS data for the day
	data, err := s.gRepo.GetByVehicle(ctx, vehicleID, start, end)
	if err != nil {
		return err
	}

	// Filter out invalid GPS data (lat/lng = 0)
	var validData []decoder.AVLData
	for _, p := range data {
		if p.Lat != 0 && p.Lng != 0 {
			validData = append(validData, p)
		}
	}

	if len(validData) == 0 {
		return nil
	}

	// ─────────────────────────────────────────────────────────────────
	// GPS-based calculations (distance, speed) — unchanged
	// ─────────────────────────────────────────────────────────────────
	var totalDistance float64
	var maxSpeed float64

	// Pre-identify stoppage segments (speed < 5 at a fixed place for >= 60 seconds)
	// Stationary GPS drift is tolerated up to 30 meters.
	inStoppage := make([]bool, len(validData))
	stoppagesCount := 0

	const minStoppageDuration = 60.0 // 60 seconds
	const maxStoppageRadiusKm = 0.03 // 30 meters

	stoppageStartIndex := -1
	for i := 0; i < len(validData); i++ {
		if validData[i].Speed == 0 {
			if stoppageStartIndex == -1 {
				stoppageStartIndex = i
			} else {
				distFromStart := utils.Haversine(
					validData[stoppageStartIndex].Lat, validData[stoppageStartIndex].Lng,
					validData[i].Lat, validData[i].Lng,
				)
				if distFromStart > maxStoppageRadiusKm {
					dur := validData[i-1].Time.Sub(validData[stoppageStartIndex].Time).Seconds()
					if dur >= minStoppageDuration {
						stoppagesCount++
						for k := stoppageStartIndex; k < i; k++ {
							inStoppage[k] = true
						}
					}
					stoppageStartIndex = i
				}
			}
		} else {
			if stoppageStartIndex != -1 {
				dur := validData[i-1].Time.Sub(validData[stoppageStartIndex].Time).Seconds()
				if dur >= minStoppageDuration {
					stoppagesCount++
					for k := stoppageStartIndex; k < i; k++ {
						inStoppage[k] = true
					}
				}
				stoppageStartIndex = -1
			}
		}
	}
	// Check the trailing stoppage segment if it extended to end-of-day
	if stoppageStartIndex != -1 {
		dur := validData[len(validData)-1].Time.Sub(validData[stoppageStartIndex].Time).Seconds()
		if dur >= minStoppageDuration {
			stoppagesCount++
			for k := stoppageStartIndex; k < len(validData); k++ {
				inStoppage[k] = true
			}
		}
	}

	// Distance and max speed loop
	var lastPoint *decoder.AVLData
	var stoppageSec int
	for i, p := range validData {
		if i > 0 {
			if utils.IsValidGPSTransition(*lastPoint, p) {
				dist := utils.Haversine(lastPoint.Lat, lastPoint.Lng, p.Lat, p.Lng)
				totalDistance += dist
			}
			duration := p.Time.Sub(lastPoint.Time).Seconds()
			if duration > 0 && duration < 3600 {
				if inStoppage[i] && inStoppage[i-1] {
					stoppageSec += int(duration)
				}
			}
		}
		if p.Speed > maxSpeed {
			maxSpeed = p.Speed
		}
		lastPoint = &validData[i]
	}

	// ─────────────────────────────────────────────────────────────────
	// Ignition state-machine — drives all operational time fields
	// ─────────────────────────────────────────────────────────────────
	// A packet is considered "ignition on" if the ignition flag is set OR
	// the vehicle is moving (speed > 2 km/h).
	ignitionOn := func(p decoder.AVLData) bool {
		return p.Ignition || p.Speed > 2
	}

	var (
		// Ignition session tracking
		inSession    bool
		sessionStart time.Time

		// Aggregated results
		startTime *time.Time
		endTime   *time.Time
		startLat  float64
		startLng  float64
		endLat    float64
		endLng    float64

		ignitionOnCount int // count of rising edges (OFF→ON)
		totalActiveSec  int // sum of completed ON→OFF session durations
		totalIdleSec    int // ignition ON + speed=0 within sessions
	)

	for i, p := range validData {
		currOn := ignitionOn(p)

		// Calculate idle: within an active session, if speed is 0, accumulate idle time
		if inSession && i > 0 {
			dt := p.Time.Sub(validData[i-1].Time).Seconds()
			if dt > 0 && dt < 3600 && p.Speed == 0 {
				totalIdleSec += int(dt)
			}
		}

		if i == 0 {
			// Initialise state from the first packet
			if currOn {
				// Day starts with ignition already on — treat as a rising edge
				inSession = true
				sessionStart = p.Time

				t := p.Time
				startTime = &t
				startLat = p.Lat
				startLng = p.Lng
				ignitionOnCount++
			}
			continue
		}

		prevOn := ignitionOn(validData[i-1])

		// Rising edge: ignition turned ON (OFF→ON)
		if !prevOn && currOn {
			inSession = true
			sessionStart = p.Time

			if startTime == nil {
				t := p.Time
				startTime = &t
				startLat = p.Lat
				startLng = p.Lng
			}
			ignitionOnCount++
		}

		// Falling edge: ignition turned OFF (ON→OFF)
		if prevOn && !currOn {
			if inSession {
				sessionDur := int(p.Time.Sub(sessionStart).Seconds())
				if sessionDur > 0 {
					totalActiveSec += sessionDur
				}
				inSession = false
			}
			t := p.Time
			endTime = &t
			endLat = p.Lat
			endLng = p.Lng
		}
	}

	// ─────────────────────────────────────────────────────────────────
	// Build start/end point JSON strings
	// ─────────────────────────────────────────────────────────────────
	startPointStr := fmt.Sprintf("{\"lng\": %f, \"lat\": %f}", startLng, startLat)
	endPointStr := fmt.Sprintf("{\"lng\": %f, \"lat\": %f}", endLng, endLat)

	// Fallback: if no ignition events detected, use first/last GPS points
	if startTime == nil {
		t := validData[0].Time
		startTime = &t
		startPointStr = fmt.Sprintf("{\"lng\": %f, \"lat\": %f}", validData[0].Lng, validData[0].Lat)
	}
	// endTime stays nil if the day ended with ignition still on (open session)

	// ─────────────────────────────────────────────────────────────────
	// Average speed = total distance / active hours
	// ─────────────────────────────────────────────────────────────────
	avgSpeed := 0.0
	if totalActiveSec > 0 {
		activeHours := float64(totalActiveSec) / 3600.0
		avgSpeed = totalDistance / activeHours
	}

	// actualIgnitionOnDuration stores the COUNT of ignition ON events as a string
	actualIgnitionOnStr := fmt.Sprintf("%d", ignitionOnCount)

	report := &repository.MovementReport{
		VehicleID:                vehicleID,
		IMEI:                     validData[0].IMEI,
		ReportDate:               start,
		Zone:                     zone,
		Ward:                     ward,
		AverageSpeed:             avgSpeed,
		TotalDistance:            totalDistance,
		StartTime:                startTime,
		EndTime:                  endTime,
		TotalActiveDuration:      formatDuration(totalActiveSec),
		TotalIdleDuration:        formatDuration(totalIdleSec),
		TotalStoppageDuration:    formatDuration(stoppageSec),
		StoppagesCount:           stoppagesCount,
		ActualIgnitionOnDuration: actualIgnitionOnStr,          // count of ON events
		TotalIgnitionOnDuration:  formatDuration(totalActiveSec), // total running duration
		MaxSpeed:                 maxSpeed,
		StartPoint:               startPointStr,
		EndPoint:                 endPointStr,
	}

	return s.repo.Upsert(ctx, report)
}

// GetReports retrieves pre-computed reports from the movement_reports table.
// Reports are generated exclusively by the nightly cron job, NOT on each API call.
// This ensures consistent, fast responses regardless of GPS data volume.
func (s *ReportService) GetReports(ctx context.Context, vehicleID int, from, to time.Time, limit, offset int) ([]repository.MovementReport, int, error) {
	return s.repo.Get(ctx, vehicleID, from, to, limit, offset)
}

func formatDuration(seconds int) string {
	h := seconds / 3600
	m := (seconds % 3600) / 60
	s := seconds % 60
	return fmt.Sprintf("%02d:%02d:%02d", h, m, s)
}
