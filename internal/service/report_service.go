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
	var sumSpeed float64
	var idleSec, stoppageSec, activeSec, ignitionOnSec int
	var stoppagesCount int
	
	// State tracking
	var lastPoint *decoder.AVLData
	var stoppageStartTime *time.Time
	
	for i, p := range validData {
		if i > 0 {
			dist := haversine(lastPoint.Lat, lastPoint.Lng, p.Lat, p.Lng)
			totalDistance += dist
			
			// Ensure duration is reasonable
			duration := p.Time.Sub(lastPoint.Time).Seconds()
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
		sumSpeed += p.Speed
		lastPoint = &validData[i]
	}

	// Catch last stoppage if it was ongoing
	if stoppageStartTime != nil {
		dur := validData[len(validData)-1].Time.Sub(*stoppageStartTime).Seconds()
		if dur >= 120 {
			stoppagesCount++
		}
	}

	avgSpeed := 0.0
	if len(validData) > 0 {
		avgSpeed = sumSpeed / float64(len(validData))
	}

	report := &repository.MovementReport{
		VehicleID:                 vehicleID,
		IMEI:                      validData[0].IMEI,
		ReportDate:                start,
		Zone:                      zone,
		Ward:                      ward,
		AverageSpeed:              avgSpeed,
		TotalDistance:             totalDistance,
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

func (s *ReportService) GetReports(ctx context.Context, vehicleID int, from, to time.Time, limit, offset int, zones, wards map[string]int) ([]repository.MovementReport, int, error) {
	// Dynamically generate reports for the requested days to ensure real-time accuracy
	vehicles, err := s.vRepo.GetAll(ctx)
	if err == nil {
		for _, v := range vehicles {
			if v.GpsDevice != nil {
				// Get zone/ward names if possible (we only have IDs in maps)
				// For now, we'll just pass the IDs as strings
				zone := ""
				if zid, ok := zones[v.RegistrationNo]; ok {
					zone = fmt.Sprintf("Zone %d", zid)
				}
				ward := ""
				if wid, ok := wards[v.RegistrationNo]; ok {
					ward = fmt.Sprintf("Ward %d", wid)
				}

				// Iterate through each day in the range
				for d := from; !d.After(to); d = d.Add(24 * time.Hour) {
					s.GenerateDailyReport(ctx, v.ID, d, zone, ward)
				}
			}
		}
	}

	return s.repo.Get(ctx, vehicleID, from, to, limit, offset)
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
