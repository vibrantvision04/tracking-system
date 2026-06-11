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
	// Phase 1: Operational Bounds & Active Time
	// ─────────────────────────────────────────────────────────────────
	// Legacy fallback: Many devices have broken physical ignition wires.
	// We MUST fall back to speed > 2 km/h to avoid missing Active Hours.
	ignitionOn := func(p decoder.AVLData) bool {
		return p.Ignition || p.Speed > 2
	}

	var (
		startTime *time.Time
		endTime   *time.Time
		startLat  float64
		startLng  float64
		endLat    float64
		endLng    float64

		totalActiveSec    int
		actualIgnitionSec int
		ignitionOnCount   int

		inSession       bool
		inActualSession bool
		sessionStart    time.Time
		actualSessionStart time.Time
	)

	isToday := start.Format("2006-01-02") == utils.CurrentTimeInIndia().Format("2006-01-02")

	for i, p := range validData {
		currOn := ignitionOn(p)
		currActualOn := p.Ignition

		// --- Actual Ignition Tracking ---
		if i == 0 {
			if currActualOn {
				inActualSession = true
				actualSessionStart = p.Time
			}
		} else {
			prevActualOn := validData[i-1].Ignition
			if !prevActualOn && currActualOn {
				inActualSession = true
				actualSessionStart = p.Time
			}
			if prevActualOn && !currActualOn {
				if inActualSession {
					dur := int(p.Time.Sub(actualSessionStart).Seconds())
					if dur > 0 {
						actualIgnitionSec += dur
					}
					inActualSession = false
				}
			}
		}

		// --- Total Active Tracking ---
		if i == 0 {
			if currOn {
				inSession = true
				sessionStart = p.Time
				t := p.Time
				startTime = &t
				startLat = p.Lat
				startLng = p.Lng
				ignitionOnCount++
			}
		} else {
			prevOn := ignitionOn(validData[i-1])
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
			if prevOn && !currOn {
				if inSession {
					dur := int(p.Time.Sub(sessionStart).Seconds())
					if dur > 0 {
						totalActiveSec += dur
					}
					inSession = false
				}
				t := p.Time
				endTime = &t
				endLat = p.Lat
				endLng = p.Lng
			}
		}
	}

	// Close open sessions at the end of the day or live point
	lastP := validData[len(validData)-1]
	if inActualSession {
		clipEnd := lastP.Time
		if !isToday { clipEnd = end }
		dur := int(clipEnd.Sub(actualSessionStart).Seconds())
		if dur > 0 { actualIgnitionSec += dur }
	}
	if inSession {
		clipEnd := lastP.Time
		if !isToday {
			clipEnd = end.Add(-time.Millisecond)
			t := clipEnd
			endTime = &t
			endLat = lastP.Lat
			endLng = lastP.Lng
		}
		dur := int(clipEnd.Sub(sessionStart).Seconds())
		if dur > 0 { totalActiveSec += dur }
	}

	// ─────────────────────────────────────────────────────────────────
	// Phase 2: Slice to Operational Window
	// ─────────────────────────────────────────────────────────────────
	var opData []decoder.AVLData
	if startTime != nil {
		// Use last point if endTime is still nil (e.g., ran all day and still running)
		activeEnd := lastP.Time
		if endTime != nil {
			activeEnd = *endTime
		}
		for _, p := range validData {
			if !p.Time.Before(*startTime) && !p.Time.After(activeEnd) {
				opData = append(opData, p)
			}
		}
	}

	// ─────────────────────────────────────────────────────────────────
	// Phase 3: Metrics strictly within the Operational Window
	// ─────────────────────────────────────────────────────────────────
	var (
		totalDistance float64
		maxSpeed      float64
		stoppageSec   int
		totalIdleSec  int
		stoppagesCount int
	)

	if len(opData) > 0 {
		// Pre-calculate stoppages (speed == 0 for >= 60s)
		inStoppage := make([]bool, len(opData))
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
					dur := opData[i-1].Time.Sub(opData[stoppageStartIndex].Time).Seconds()
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
		if stoppageStartIndex != -1 {
			dur := opData[len(opData)-1].Time.Sub(opData[stoppageStartIndex].Time).Seconds()
			if dur >= minStoppageDuration {
				stoppagesCount++
				for k := stoppageStartIndex; k < len(opData); k++ {
					inStoppage[k] = true
				}
			}
		}

		var lastOp *decoder.AVLData
		for i, p := range opData {
			if p.Speed > maxSpeed {
				maxSpeed = p.Speed
			}
			
			if i > 0 {
				if utils.IsValidGPSTransition(*lastOp, p) {
					totalDistance += utils.Haversine(lastOp.Lat, lastOp.Lng, p.Lat, p.Lng)
				}
				
				dt := p.Time.Sub(lastOp.Time).Seconds()
				if dt > 0 && dt < 3600 {
					// Stoppage Time: Any time inside a detected stoppage block
					if inStoppage[i] && inStoppage[i-1] {
						stoppageSec += int(dt)
					}
					// Idle Time: Engine ON AND Speed == 0
					if p.Speed == 0 && ignitionOn(p) {
						totalIdleSec += int(dt)
					}
				}
			}
			lastOp = &opData[i]
		}
	}

	// ─────────────────────────────────────────────────────────────────
	// Phase 4: Finalize Metrics
	// ─────────────────────────────────────────────────────────────────
	startPointStr := "{}"
	endPointStr := "{}"
	if startTime != nil {
		startPointStr = fmt.Sprintf("{\"lng\": %f, \"lat\": %f}", startLng, startLat)
		if endTime != nil {
			endPointStr = fmt.Sprintf("{\"lng\": %f, \"lat\": %f}", endLng, endLat)
		} else {
			endPointStr = fmt.Sprintf("{\"lng\": %f, \"lat\": %f}", validData[len(validData)-1].Lng, validData[len(validData)-1].Lat)
		}
	} else {
		// Fallback if NO activity at all
		t := validData[0].Time
		startTime = &t
		startPointStr = fmt.Sprintf("{\"lng\": %f, \"lat\": %f}", validData[0].Lng, validData[0].Lat)
	}

	// Movement Duration is Active Time minus Idle Time
	movementSec := totalActiveSec - totalIdleSec
	if movementSec < 0 {
		movementSec = 0
	}

	avgSpeed := 0.0
	if movementSec > 0 {
		movementHours := float64(movementSec) / 3600.0
		avgSpeed = totalDistance / movementHours
	}

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
		ActualIgnitionOnDuration: formatDuration(actualIgnitionSec),
		TotalIgnitionOnDuration:  formatDuration(totalActiveSec),
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
