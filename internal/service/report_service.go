package service

import (
	"context"
	"encoding/json"
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


type geofencePoint struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

func pointInPolygon(lat, lng float64, polygon []geofencePoint) bool {
	if len(polygon) == 0 {
		return false
	}
	isInside := false
	for i, j := 0, len(polygon)-1; i < len(polygon); j, i = i, i+1 {
		if ((polygon[i].Lat > lat) != (polygon[j].Lat > lat)) &&
			(lng < (polygon[j].Lng-polygon[i].Lng)*(lat-polygon[i].Lat)/(polygon[j].Lat-polygon[i].Lat)+polygon[i].Lng) {
			isInside = !isInside
		}
	}
	return isInside
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

	// Fetch ward polygon GeoJSON for geofencing
	var wardGeoJSON string
	_ = s.gRepo.Pool().QueryRow(ctx, `
		SELECT COALESCE(g.polygon::text, '')
		FROM vehicles v
		JOIN regions w ON v.ward_id = w.id
		JOIN geofences g ON w.geofence_id = g.id
		WHERE v.id = $1
	`, vehicleID).Scan(&wardGeoJSON)

	var wardPolygon []geofencePoint
	if wardGeoJSON != "" {
		_ = json.Unmarshal([]byte(wardGeoJSON), &wardPolygon)
	}

	// Fetch GPS data for the day
	data, err := s.gRepo.GetByVehicle(ctx, vehicleID, start, end)
	if err != nil {
		return err
	}

	// Filter out invalid GPS data
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
	// 1. START TIME & END TIME Calculation
	// ─────────────────────────────────────────────────────────────────
	var startTime *time.Time
	var endTime *time.Time
	var startLat, startLng float64
	var endLat, endLng float64

	// Helper for virtual ignition ON
	isIgnitionOn := func(p decoder.AVLData) bool {
		return p.Ignition || p.Speed > 2
	}

	// Find first Ignition ON
	for _, p := range validData {
		if isIgnitionOn(p) {
			t := p.Time
			startTime = &t
			startLat = p.Lat
			startLng = p.Lng
			break
		}
	}

	if startTime != nil {
		var lastOff *decoder.AVLData
		// Find latest Ignition OFF transition
		for i := 1; i < len(validData); i++ {
			prevOn := isIgnitionOn(validData[i-1])
			currOn := isIgnitionOn(validData[i])
			if prevOn && !currOn {
				lastOff = &validData[i]
			}
		}

		lastP := validData[len(validData)-1]
		lastPOn := isIgnitionOn(lastP)

		if lastPOn {
			// Vehicle is currently ON / moving at the end of data
			t := lastP.Time
			endTime = &t
			endLat = lastP.Lat
			endLng = lastP.Lng
		} else if lastOff != nil {
			// Use the latest completed session OFF event
			t := lastOff.Time
			endTime = &t
			endLat = lastOff.Lat
			endLng = lastOff.Lng
		} else {
			// Fallback to the last packet's time
			t := lastP.Time
			endTime = &t
			endLat = lastP.Lat
			endLng = lastP.Lng
		}
	} else {
		// Fallback: No activity at all
		t := validData[0].Time
		startTime = &t
		startLat = validData[0].Lat
		startLng = validData[0].Lng

		tEnd := validData[len(validData)-1].Time
		endTime = &tEnd
		endLat = validData[len(validData)-1].Lat
		endLng = validData[len(validData)-1].Lng
	}

	// ─────────────────────────────────────────────────────────────────
	// 2. Operational Window Slicing
	// ─────────────────────────────────────────────────────────────────
	var opData []decoder.AVLData
	if startTime != nil && endTime != nil {
		for _, p := range validData {
			if !p.Time.Before(*startTime) && !p.Time.After(*endTime) {
				opData = append(opData, p)
			}
		}
	}

	// ─────────────────────────────────────────────────────────────────
	// 3. Stoppage Identification and Classification
	// ─────────────────────────────────────────────────────────────────
	type stoppageEvent struct {
		startTime time.Time
		endTime   time.Time
		duration  float64
	}
	var stoppages []stoppageEvent

	if len(opData) > 0 {
		stoppageStartIndex := -1
		const minStoppageDuration = 60.0
		const maxStoppageRadiusKm = 0.03

		for i := 0; i < len(opData); i++ {
			if opData[i].Speed == 0 {
				if stoppageStartIndex == -1 {
					stoppageStartIndex = i
				} else {
					dist := utils.Haversine(
						opData[stoppageStartIndex].Lat, opData[stoppageStartIndex].Lng,
						opData[i].Lat, opData[i].Lng,
					)
					if dist > maxStoppageRadiusKm {
						dur := opData[i-1].Time.Sub(opData[stoppageStartIndex].Time).Seconds()
						if dur >= minStoppageDuration {
							stoppages = append(stoppages, stoppageEvent{
								startTime: opData[stoppageStartIndex].Time,
								endTime:   opData[i-1].Time,
								duration:  dur,
							})
						}
						stoppageStartIndex = i
					}
				}
			} else {
				if stoppageStartIndex != -1 {
					dur := opData[i-1].Time.Sub(opData[stoppageStartIndex].Time).Seconds()
					if dur >= minStoppageDuration {
						stoppages = append(stoppages, stoppageEvent{
							startTime: opData[stoppageStartIndex].Time,
							endTime:   opData[i-1].Time,
							duration:  dur,
						})
					}
					stoppageStartIndex = -1
				}
			}
		}
		if stoppageStartIndex != -1 {
			dur := opData[len(opData)-1].Time.Sub(opData[stoppageStartIndex].Time).Seconds()
			if dur >= minStoppageDuration {
				stoppages = append(stoppages, stoppageEvent{
					startTime: opData[stoppageStartIndex].Time,
					endTime:   opData[len(opData)-1].Time,
					duration:  dur,
				})
			}
		}
	}

	var minorStoppagesCount int
	var majorStoppagesCount int
	var minorStoppageSec float64
	var majorStoppageSec float64

	for _, s := range stoppages {
		if s.duration < 600.0 { // less than 10 minutes
			minorStoppagesCount++
			minorStoppageSec += s.duration
		} else { // 10 minutes or more
			majorStoppagesCount++
			majorStoppageSec += s.duration
		}
	}

	totalStoppagesCount := minorStoppagesCount + majorStoppagesCount
	totalStoppageSec := minorStoppageSec + majorStoppageSec

	// Flag pings inside stoppages to bound idle calculations
	inStoppage := make([]bool, len(opData))
	for _, s := range stoppages {
		for k := 0; k < len(opData); k++ {
			if !opData[k].Time.Before(s.startTime) && !opData[k].Time.After(s.endTime) {
				inStoppage[k] = true
			}
		}
	}

	// ─────────────────────────────────────────────────────────────────
	// 4. Metrics Calculations (Distance, Speed, Ignition, Idle)
	// ─────────────────────────────────────────────────────────────────
	var totalDistance float64
	var maxSpeed float64
	var wardSpeeds []float64
	var actualIgnitionSec float64
	var totalIgnitionSec float64
	var idleSec float64

	// Distance, Max Speed (calculated on the full calendar day's validData to prevent truncation)
	var lastOp *decoder.AVLData
	for i := 0; i < len(validData); i++ {
		p := validData[i]
		if p.Speed > maxSpeed {
			maxSpeed = p.Speed
		}
		
		// Skip distance accumulation if the vehicle is stationary (ignition is OFF) to prevent parked drift
		if !isIgnitionOn(p) {
			lastOp = nil // Reset segment so we start fresh when ignition turns ON
			continue
		}

		if lastOp == nil {
			lastOp = &validData[i]
			continue
		}
		if utils.IsValidGPSTransition(*lastOp, p) {
			totalDistance += utils.Haversine(lastOp.Lat, lastOp.Lng, p.Lat, p.Lng)
			lastOp = &validData[i] // Correct: only update lastOp on valid transitions
		}
	}

	// Average Speed inside ward
	for _, p := range opData {
		inWard := len(wardPolygon) == 0 || pointInPolygon(p.Lat, p.Lng, wardPolygon)
		if inWard && p.Speed > 2 {
			wardSpeeds = append(wardSpeeds, p.Speed)
		}
	}

	avgSpeed := 0.0
	if len(wardSpeeds) > 0 {
		sum := 0.0
		for _, s := range wardSpeeds {
			sum += s
		}
		avgSpeed = sum / float64(len(wardSpeeds))
	} else if totalDistance > 0 && len(opData) > 0 {
		// Fallback if no ward boundary or pings in ward: calculate overall average moving speed
		var allSpeeds []float64
		for _, p := range opData {
			if p.Speed > 2 {
				allSpeeds = append(allSpeeds, p.Speed)
			}
		}
		if len(allSpeeds) > 0 {
			sum := 0.0
			for _, s := range allSpeeds {
				sum += s
			}
			avgSpeed = sum / float64(len(allSpeeds))
		}
	}

	// Actual & Total Ignition ON Durations
	for i := 1; i < len(validData); i++ {
		prev := validData[i-1]
		curr := validData[i]
		prevOn := isIgnitionOn(prev)
		currOn := isIgnitionOn(curr)
		if prevOn && currOn {
			dt := curr.Time.Sub(prev.Time).Seconds()
			if dt > 0 && dt < 3600 {
				totalIgnitionSec += dt
				inWard := len(wardPolygon) == 0 || pointInPolygon(curr.Lat, curr.Lng, wardPolygon)
				if inWard {
					actualIgnitionSec += dt
				}
			}
		}
	}

	// Idle Duration: engine ON AND speed == 0 AND inside stoppage
	for i := 1; i < len(opData); i++ {
		prev := opData[i-1]
		curr := opData[i]
		currOn := isIgnitionOn(curr)
		if currOn && curr.Speed == 0 && inStoppage[i] {
			dt := curr.Time.Sub(prev.Time).Seconds()
			if dt > 0 && dt < 3600 {
				idleSec += dt
			}
		}
	}

	// Active Hours: END TIME - START TIME
	var activeSec int
	if startTime != nil && endTime != nil {
		activeSec = int(endTime.Sub(*startTime).Seconds())
		if activeSec < 0 {
			activeSec = 0
		}
	}

	startPointStr := fmt.Sprintf("{\"lng\": %f, \"lat\": %f}", startLng, startLat)
	endPointStr := fmt.Sprintf("{\"lng\": %f, \"lat\": %f}", endLng, endLat)

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
		TotalActiveDuration:      formatDuration(activeSec),
		TotalIdleDuration:        formatDuration(int(idleSec)),
		TotalStoppageDuration:    formatDuration(int(totalStoppageSec)),
		StoppagesCount:           totalStoppagesCount,
		ActualIgnitionOnDuration: formatDuration(int(actualIgnitionSec)),
		TotalIgnitionOnDuration:  formatDuration(int(totalIgnitionSec)),
		MaxSpeed:                 maxSpeed,
		StartPoint:               startPointStr,
		EndPoint:                 endPointStr,
		MinorStoppages:           minorStoppagesCount,
		MajorStoppages:           majorStoppagesCount,
	}

	return s.repo.Upsert(ctx, report)
}

// GetReports retrieves pre-computed reports from the movement_reports table.
// Reports are generated exclusively by the nightly cron job, NOT on each API call.
// This ensures consistent, fast responses regardless of GPS data volume.
func (s *ReportService) GetReports(ctx context.Context, vehicleID int, from, to time.Time, limit, offset int) ([]repository.MovementReport, int, error) {
	return s.repo.Get(ctx, vehicleID, from, to, limit, offset)
}

func (s *ReportService) FinalizeForDate(ctx context.Context, date time.Time) error {
	return s.repo.FinalizeReportsForDate(ctx, date)
}

func (s *ReportService) UnfinalizeForDate(ctx context.Context, date time.Time, vehicleID int) error {
	return s.repo.UnfinalizeReportsForDate(ctx, date, vehicleID)
}

func formatDuration(seconds int) string {
	h := seconds / 3600
	m := (seconds % 3600) / 60
	s := seconds % 60
	return fmt.Sprintf("%02d:%02d:%02d", h, m, s)
}
