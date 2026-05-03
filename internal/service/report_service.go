package service

import (
	"context"
	"fmt"
	"gps-tracking-system/internal/decoder"
	"gps-tracking-system/internal/repository"
	"math"
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

// Haversine calculates the distance between two points in meters.
func Haversine(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371000 // Earth radius in meters
	
	phi1 := lat1 * math.Pi / 180
	phi2 := lat2 * math.Pi / 180
	dphi := (lat2 - lat1) * math.Pi / 180
	dlambda := (lon2 - lon1) * math.Pi / 180

	a := math.Sin(dphi/2)*math.Sin(dphi/2) +
		math.Cos(phi1)*math.Cos(phi2)*
			math.Sin(dlambda/2)*math.Sin(dlambda/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return R * c
}

func (s *ReportService) GenerateDailyReport(ctx context.Context, vehicleID int, date time.Time) error {
	start := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())
	end := start.Add(24 * time.Hour)

	// Fetch GPS data for the day
	data, err := s.gRepo.GetByVehicle(ctx, vehicleID, start, end)
	if err != nil {
		return err
	}

	if len(data) == 0 {
		return nil
	}

	var totalDistance float64
	var maxSpeed float64
	var sumSpeed float64
	var idleSec, stoppageSec, activeSec, ignitionOnSec int
	
	// State tracking
	var lastPoint *decoder.AVLData
	
	for i, p := range data {
		if i > 0 {
			dist := haversine(lastPoint.Lat, lastPoint.Lng, p.Lat, p.Lng)
			totalDistance += dist
			
			// Ensure duration is reasonable (e.g. less than 1 hour between points to avoid huge jumps)
			duration := p.Time.Sub(lastPoint.Time).Seconds()
			if duration > 0 && duration < 3600 {
				isIgnitionOn := p.Ignition || p.Speed > 5 // Fallback to speed if ignition wire is disconnected
				
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
		
		if p.Speed > maxSpeed {
			maxSpeed = p.Speed
		}
		sumSpeed += p.Speed
		lastPoint = &data[i]
	}

	avgSpeed := sumSpeed / float64(len(data))

	report := &repository.MovementReport{
		VehicleID:                 vehicleID,
		IMEI:                      data[0].IMEI,
		ReportDate:                start,
		AverageSpeed:              avgSpeed,
		TotalDistance:             totalDistance,
		StartTime:                 data[0].Time,
		EndTime:                   data[len(data)-1].Time,
		TotalActiveDuration:       formatDuration(activeSec),
		TotalIdleDuration:         formatDuration(idleSec),
		TotalStoppageDuration:     formatDuration(stoppageSec),
		ActualIgnitionOnDuration:  formatDuration(ignitionOnSec),
		TotalIgnitionOnDuration:   formatDuration(ignitionOnSec), // Simplification for now
		MaxSpeed:                  maxSpeed,
		StartPoint:                fmt.Sprintf("{\"x\": %f, \"y\": %f}", data[0].Lng, data[0].Lat),
		EndPoint:                  fmt.Sprintf("{\"x\": %f, \"y\": %f}", data[len(data)-1].Lng, data[len(data)-1].Lat),
	}

	return s.repo.Upsert(ctx, report)
}

func (s *ReportService) GetReports(ctx context.Context, vehicleID int, from, to time.Time) ([]repository.MovementReport, error) {
	// Dynamically generate reports for the requested days to ensure real-time accuracy
	vehicles, err := s.vRepo.GetAll(ctx)
	if err == nil {
		for _, v := range vehicles {
			if v.GpsDevice != nil {
				// Iterate through each day in the range
				for d := from; !d.After(to); d = d.Add(24 * time.Hour) {
					// We ignore errors here since some days/vehicles might legitimately have no data
					s.GenerateDailyReport(ctx, v.ID, d)
				}
			}
		}
	}

	return s.repo.Get(ctx, vehicleID, from, to)
}

func haversine(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371 // km
	dLat := (lat2 - lat1) * (math.Pi / 180)
	dLon := (lon2 - lon1) * (math.Pi / 180)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*(math.Pi/180))*math.Cos(lat2*(math.Pi/180))*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return R * c
}

func formatDuration(seconds int) string {
	h := seconds / 3600
	m := (seconds % 3600) / 60
	s := seconds % 60
	return fmt.Sprintf("%02d:%02d:%02d", h, m, s)
}
