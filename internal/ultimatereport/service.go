package ultimatereport

import (
	"context"
	"fmt"
	"strings"
	"time"

	"gps-tracking-system/internal/utils"
)

// exceptionLabel converts a DB enum value to the human-readable remark label
// matching what was previously typed manually into Excel.
func exceptionLabel(e ExceptionRow) string {
	if e.Remarks != "" {
		return e.Remarks
	}
	switch e.ExceptionType {
	case "GPS_TAMPERED":
		return "GPS TAMPERED"
	case "NOT_WORKED":
		return "NOT WORKED"
	case "NETWORK_ISSUE":
		return "NETWORK ISSUE"
	case "VEHICLE_BREAKDOWN":
		return "VEHICLE BREAKDOWN"
	case "REPLACED":
		if e.ReplacementVehicle != "" {
			return "REPLACED BY " + e.ReplacementVehicle
		}
		return "REPLACED"
	default:
		return strings.ToUpper(e.ExceptionType)
	}
}

// UltimateReportService assembles ReportData from existing system tables.
// All business logic lives here — Excel engine only injects values.
type UltimateReportService struct {
	repo *UltimateReportRepository
}

func NewUltimateReportService(repo *UltimateReportRepository) *UltimateReportService {
	return &UltimateReportService{repo: repo}
}

// BuildReportData assembles the full dataset for the given date.
func (s *UltimateReportService) BuildReportData(ctx context.Context, date time.Time) (*ReportData, error) {
	// Normalize to IST midnight
	date = time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, utils.IndianLocation)

	// ── Parallel data fetch ──────────────────────────────────────────────────
	type fetchResult struct {
		movements  []MovementRow
		coverage   map[string]float64
		fleet      []FleetMasterRow
		exceptions map[string]ExceptionRow
		trips      map[string]int
		err        error
	}

	ch := make(chan fetchResult, 1)
	go func() {
		var r fetchResult
		r.movements, r.err = s.repo.GetMovementData(ctx, date)
		if r.err != nil {
			ch <- r; return
		}
		r.coverage, r.err = s.repo.GetCoveragePercent(ctx, date)
		if r.err != nil {
			ch <- r; return
		}
		r.fleet, r.err = s.repo.GetFleetMaster(ctx)
		if r.err != nil {
			ch <- r; return
		}
		r.exceptions, r.err = s.repo.GetExceptions(ctx, date)
		if r.err != nil {
			ch <- r; return
		}
		r.trips, r.err = s.repo.GetTripCounts(ctx, date)
		ch <- r
	}()

	res := <-ch
	if res.err != nil {
		return nil, fmt.Errorf("ultimatereport: data fetch error: %w", res.err)
	}

	// ── Build fleet lookup map (reg_no → FleetMasterRow) ────────────────────
	fleetMap := make(map[string]FleetMasterRow, len(res.fleet))
	for _, f := range res.fleet {
		fleetMap[f.VehicleRegNo] = f
	}

	// ── EAR threshold: 13:00 IST ────────────────────────────────────────────
	earCutoff := time.Date(date.Year(), date.Month(), date.Day(), 13, 0, 0, 0, utils.IndianLocation)

	rd := &ReportData{
		ReportDate: date,
		DateLabel:  date.Format("Monday, January 02, 2006"),
	}

	// ── Populate RawMovements & RawCoverages ─────────────────────────────────
	var rawMovements []RawMovementInfo
	var rawCoverages []RawCoverageInfo
	movedMap := make(map[string]bool)

	for _, m := range res.movements {
		movedMap[m.RegistrationNo] = true
		rawMovements = append(rawMovements, RawMovementInfo{
			RegistrationNo: m.RegistrationNo,
			StartTime:      m.StartTime,
			EndTime:        m.EndTime,
			ActiveHours:    m.ActiveHours,
			Distance:       m.TotalDistance,
			AverageSpeed:   m.AverageSpeed,
		})

		pct := res.coverage[m.RegistrationNo]
		
		// Write both MORNING and EVENING keys to support VLOOKUP in both shifts
		rawCoverages = append(rawCoverages, RawCoverageInfo{
			Key:             "MORNING_" + m.RegistrationNo,
			RegistrationNo:  m.RegistrationNo,
			CoveragePercent: pct,
		})
		rawCoverages = append(rawCoverages, RawCoverageInfo{
			Key:             "EVENING_" + m.RegistrationNo,
			RegistrationNo:  m.RegistrationNo,
			CoveragePercent: pct,
		})
	}

	// Add inactive active-fleet vehicles with 0% coverage and 0 distance to avoid #N/A errors on VLOOKUP
	for _, f := range res.fleet {
		if f.IsActive && !movedMap[f.VehicleRegNo] {
			rawMovements = append(rawMovements, RawMovementInfo{
				RegistrationNo: f.VehicleRegNo,
				ActiveHours:    "00:00:00",
				Distance:       0.0,
				AverageSpeed:   0.0,
			})

			rawCoverages = append(rawCoverages, RawCoverageInfo{
				Key:             "MORNING_" + f.VehicleRegNo,
				RegistrationNo:  f.VehicleRegNo,
				CoveragePercent: 0,
			})
			rawCoverages = append(rawCoverages, RawCoverageInfo{
				Key:             "EVENING_" + f.VehicleRegNo,
				RegistrationNo:  f.VehicleRegNo,
				CoveragePercent: 0,
			})
		}
	}

	rd.RawMovements = rawMovements
	rd.RawCoverages = rawCoverages

	// ── Route each vehicle to the correct sheet ──────────────────────────────
	for _, m := range res.movements {
		coverage := res.coverage[m.RegistrationNo]
		trips := res.trips[m.RegistrationNo]
		exc, hasExc := res.exceptions[m.RegistrationNo]

		remarks := ""
		if hasExc {
			remarks = exceptionLabel(exc)
		}

		// Determine zone: fleet_master is authoritative; fallback to movement_reports zone field
		fm, inFleet := fleetMap[m.RegistrationNo]
		zone := m.ZoneName
		ward := m.WardName
		if inFleet {
			zone = fm.AssignedZone
			if fm.AssignedWard != "" {
				ward = fm.AssignedWard
			}
		}

		isNotWorked := m.TotalDistance == 0 || (hasExc && exc.ExceptionType == "NOT_WORKED")

		// EAR check (D2D hoppers only, not SW)
		isEAR := m.EndTime != nil && m.EndTime.In(utils.IndianLocation).Before(earCutoff)

		switch zone {
		case "HMZ", "CLZ", "KPZ", "ANZ":
			row := ZoneRow{
				Ward:            ward,
				RegistrationNo:  m.RegistrationNo,
				CoveragePercent: coverage,
				Distance:        m.TotalDistance,
				AverageSpeed:    m.AverageSpeed,
				Remarks:         remarks,
			}
			switch zone {
			case "HMZ":
				rd.HMZ = append(rd.HMZ, row)
			case "CLZ":
				rd.CLZ = append(rd.CLZ, row)
			case "KPZ":
				rd.KPZ = append(rd.KPZ, row)
			case "ANZ":
				rd.ANZ = append(rd.ANZ, row)
			}
			if isEAR {
				rd.EAR = append(rd.EAR, EARRow{
					Zone:           zone,
					Ward:           ward,
					RegistrationNo: m.RegistrationNo,
					StartTime:      m.StartTime,
					EndTime:        m.EndTime,
					ActiveHours:    m.ActiveHours,
					Distance:       m.TotalDistance,
				})
			}
			_ = isNotWorked // used in summary below

		case "SW":
			rd.SW = append(rd.SW, SWRow{
				Ward:           ward,
				RegistrationNo: m.RegistrationNo,
				StartTime:      m.StartTime,
				EndTime:        m.EndTime,
				ActiveHours:    m.ActiveHours,
				Distance:       m.TotalDistance,
				AverageSpeed:   m.AverageSpeed,
				Remarks:        remarks,
			})

		default:
			// Vehicles not in fleet_master or zone="DEPARTED" fall to DEPARTED sheet
			rd.Departed = append(rd.Departed, DepartedRow{
				Zone:           zone,
				Ward:           ward,
				RegistrationNo: m.RegistrationNo,
				StartTime:      m.StartTime,
				EndTime:        m.EndTime,
				ActiveHours:    m.ActiveHours,
				Distance:       m.TotalDistance,
			})
		}

		// DEPARTED: also add vehicles from fleet_master that have no movement data
		// (handled below after the loop)
		_ = trips
	}

	// ── Vehicles in fleet_master with no movement data → DEPARTED ───────────
	movedSet := make(map[string]bool, len(res.movements))
	for _, m := range res.movements {
		movedSet[m.RegistrationNo] = true
	}
	for _, f := range res.fleet {
		if f.IsActive && !movedSet[f.VehicleRegNo] {
			exc, hasExc := res.exceptions[f.VehicleRegNo]
			remarks := ""
			if hasExc {
				remarks = exceptionLabel(exc)
			} else {
				remarks = "NOT WORKED"
			}
			_ = remarks
			// Only add to DEPARTED if they have no telemetry at all
			rd.Departed = append(rd.Departed, DepartedRow{
				Zone:           f.AssignedZone,
				Ward:           f.AssignedWard,
				RegistrationNo: f.VehicleRegNo,
			})
		}
	}

	// ── Build SUM sheet ─────────────────────────────────────────────────────
	rd.D2DSummary = s.buildD2DSummary(rd, res.trips, res.exceptions)
	rd.SWSummary = s.buildSWSummary(rd, res.trips, res.exceptions)

	// Totals row
	for _, z := range rd.D2DSummary {
		rd.TotalD2DHoppers += z.NoOfHoppers
		rd.TotalNotWorked += z.NotWorked
		rd.TotalTrips += z.Trips
	}
	if len(rd.D2DSummary) > 0 {
		var sumCov, sumDist float64
		for _, z := range rd.D2DSummary {
			sumCov += z.AvgCoverage
			sumDist += z.AvgDistance
		}
		rd.OverallAvgCov = sumCov / float64(len(rd.D2DSummary))
		rd.OverallAvgDist = sumDist / float64(len(rd.D2DSummary))
	}

	return rd, nil
}

func (s *UltimateReportService) buildD2DSummary(rd *ReportData, trips map[string]int, exceptions map[string]ExceptionRow) []ZoneSummary {
	type zoneData struct {
		name    string
		rows    []ZoneRow
		zoneKey string
	}
	zones := []zoneData{
		{"HAWAMAHAL - AMER ZONE", rd.HMZ, "HMZ"},
		{"CIVIL LINES ZONE", rd.CLZ, "CLZ"},
		{"KISHANPOLE ZONE", rd.KPZ, "KPZ"},
		{"ADARSH NAGAR ZONE", rd.ANZ, "ANZ"},
	}

	var summaries []ZoneSummary
	for _, z := range zones {
		var totalCov, totalDist float64
		notWorked := 0
		tripCount := 0
		for _, row := range z.rows {
			totalCov += row.CoveragePercent
			totalDist += row.Distance
			exc, hasExc := exceptions[row.RegistrationNo]
			if row.Distance == 0 || (hasExc && exc.ExceptionType == "NOT_WORKED") {
				notWorked++
			}
			tripCount += trips[row.RegistrationNo]
		}
		n := len(z.rows)
		avgCov, avgDist := 0.0, 0.0
		if n > 0 {
			avgCov = totalCov / float64(n)
			avgDist = totalDist / float64(n)
		}
		summaries = append(summaries, ZoneSummary{
			ZoneName:    z.name,
			NoOfHoppers: n,
			NotWorked:   notWorked,
			AvgCoverage: avgCov,
			AvgDistance: avgDist,
			Trips:       tripCount,
		})
	}
	return summaries
}

func (s *UltimateReportService) buildSWSummary(rd *ReportData, trips map[string]int, exceptions map[string]ExceptionRow) []SWSummary {
	// Group SW rows by zone (use ward prefix as a proxy, or fleet_master zone)
	// For simplicity, we split by zone name prefixes.
	zoneCounts := map[string]*SWSummary{
		"HAWAMAHAL - AMER ZONE": {ZoneName: "HAWAMAHAL - AMER ZONE"},
		"CIVIL LINES ZONE":      {ZoneName: "CIVIL LINES ZONE"},
		"KISHANPOLE ZONE":       {ZoneName: "KISHANPOLE ZONE"},
		"ADARSH NAGAR ZONE":     {ZoneName: "ADARSH NAGAR ZONE"},
	}
	zoneOrder := []string{"HAWAMAHAL - AMER ZONE", "CIVIL LINES ZONE", "KISHANPOLE ZONE", "ADARSH NAGAR ZONE"}

	for _, row := range rd.SW {
		// Determine zone from ward name or remarks — fall back to first zone
		zoneName := guessZoneFromWard(row.Ward)
		if z, ok := zoneCounts[zoneName]; ok {
			z.NoOfHoppers++
			z.AvgDistance += row.Distance
			z.Trips += trips[row.RegistrationNo]
			exc, hasExc := exceptions[row.RegistrationNo]
			if row.Distance == 0 || (hasExc && exc.ExceptionType == "NOT_WORKED") {
				z.NotWorked++
			}
		}
	}

	// Compute averages
	var result []SWSummary
	for _, name := range zoneOrder {
		z := zoneCounts[name]
		if z.NoOfHoppers > 0 {
			z.AvgDistance = z.AvgDistance / float64(z.NoOfHoppers)
		}
		result = append(result, *z)
	}
	return result
}

// guessZoneFromWard maps a ward name to a zone name. This is a fallback for SW vehicles.
// The fleet_master.assigned_zone is the preferred source.
func guessZoneFromWard(ward string) string {
	ward = strings.ToUpper(ward)
	switch {
	case strings.Contains(ward, "HAWAMAHAL") || strings.Contains(ward, "AMER") || strings.Contains(ward, "ZONE 1"):
		return "HAWAMAHAL - AMER ZONE"
	case strings.Contains(ward, "CIVIL") || strings.Contains(ward, "ZONE 2"):
		return "CIVIL LINES ZONE"
	case strings.Contains(ward, "KISHANPOLE") || strings.Contains(ward, "ZONE 3"):
		return "KISHANPOLE ZONE"
	case strings.Contains(ward, "ADARSH") || strings.Contains(ward, "ZONE 4"):
		return "ADARSH NAGAR ZONE"
	default:
		return "HAWAMAHAL - AMER ZONE"
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Public exception management methods (used by API handlers)
// ─────────────────────────────────────────────────────────────────────────────

// GetExceptions returns exceptions for the given date as a slice for JSON serialization.
func (s *UltimateReportService) GetExceptions(ctx context.Context, date time.Time) (map[string]ExceptionRow, error) {
	return s.repo.GetExceptions(ctx, date)
}

// UpsertException inserts or updates a daily exception record.
func (s *UltimateReportService) UpsertException(ctx context.Context, reportDate, vehicleRegNo, exceptionType, replacementVehicle, remarks string) (int, error) {
	query := `
		INSERT INTO daily_exceptions (report_date, vehicle_reg_no, exception_type, replacement_vehicle, remarks)
		VALUES ($1, $2, $3::exception_type_enum, $4, $5)
		ON CONFLICT (report_date, vehicle_reg_no)
		DO UPDATE SET
			exception_type      = EXCLUDED.exception_type,
			replacement_vehicle = EXCLUDED.replacement_vehicle,
			remarks             = EXCLUDED.remarks
		RETURNING id
	`
	var id int
	err := s.repo.pool.QueryRow(ctx, query, reportDate, vehicleRegNo, exceptionType, replacementVehicle, remarks).Scan(&id)
	return id, err
}

// DeleteException removes a daily exception for a vehicle on a date.
func (s *UltimateReportService) DeleteException(ctx context.Context, reportDate, vehicleRegNo string) error {
	_, err := s.repo.pool.Exec(ctx,
		`DELETE FROM daily_exceptions WHERE report_date = $1 AND vehicle_reg_no = $2`,
		reportDate, vehicleRegNo,
	)
	return err
}
