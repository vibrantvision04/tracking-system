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

	var totalDistance float64
	var maxSpeed float64
	var idleSec, stoppageSec, activeSec, ignitionOnSec int
	var stoppagesCount int

	// State tracking
	var lastPoint *decoder.AVLData
	var stoppageStartTime *time.Time

	for i, p := range validData {
		if i > 0 {
			duration := p.Time.Sub(lastPoint.Time).Seconds()

			// Only accumulate distance if the transition passes validation
			if utils.IsValidGPSTransition(*lastPoint, p) {
				dist := utils.Haversine(lastPoint.Lat, lastPoint.Lng, p.Lat, p.Lng)
				totalDistance += dist
			}

			// Ensure duration is reasonable for time-based calculations
			if duration > 0 && duration < 3600 {
				isIgnitionOn := p.Ignition || p.Speed > 5

				if isIgnitionOn {
					ignitionOnSec += int(duration)
					if p.Speed > 5 {
						activeSec += int(duration)
					} else {
						idleSec += int(duration)
					}
				} else {
					stoppageSec += int(duration)
				}
			}
		}

		// Calculate Stoppage Count (stopped for more than 120 seconds)
		if p.Speed < 5 {
			if stoppageStartTime == nil {
				stoppageStartTime = &validData[i].Time
			}
		} else {
			if stoppageStartTime != nil {
				dur := p.Time.Sub(*stoppageStartTime).Seconds()
				if dur >= 120 {
					stoppagesCount++
				}
				stoppageStartTime = nil
			}
		}

		if p.Speed > maxSpeed {
			maxSpeed = p.Speed
		}
		lastPoint = &validData[i]
	}

	// Catch last stoppage if it was ongoing
	if stoppageStartTime != nil {
		dur := validData[len(validData)-1].Time.Sub(*stoppageStartTime).Seconds()
		if dur >= 120 {
			stoppagesCount++
		}
	}

	// Average speed = total distance / active hours (not mean of speed readings)
	avgSpeed := 0.0
	if activeSec > 0 {
		activeHours := float64(activeSec) / 3600.0
		avgSpeed = totalDistance / activeHours
	}

	report := &repository.MovementReport{
		VehicleID:                 vehicleID,
		IMEI:                      validData[0].IMEI,
		ReportDate:                start,
		Zone:                      zone,
		Ward:                      ward,
		AverageSpeed:              avgSpeed,
		TotalDistance:              totalDistance,
		StartTime:                 validData[0].Time,
		EndTime:                   validData[len(validData)-1].Time,
		TotalActiveDuration:       formatDuration(activeSec),
		TotalIdleDuration:         formatDuration(idleSec),
		TotalStoppageDuration:     formatDuration(stoppageSec),
		StoppagesCount:            stoppagesCount,
		ActualIgnitionOnDuration:  formatDuration(ignitionOnSec),
		TotalIgnitionOnDuration:   formatDuration(ignitionOnSec),
		MaxSpeed:                  maxSpeed,
		StartPoint:                fmt.Sprintf("{\"lng\": %f, \"lat\": %f}", validData[0].Lng, validData[0].Lat),
		EndPoint:                  fmt.Sprintf("{\"lng\": %f, \"lat\": %f}", validData[len(validData)-1].Lng, validData[len(validData)-1].Lat),
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
