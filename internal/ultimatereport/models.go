package ultimatereport

import "time"

// ─────────────────────────────────────────────────────────────────────────────
// Row types — one per sheet category
// ─────────────────────────────────────────────────────────────────────────────

// ZoneRow is one row in HMZ / CLZ / KPZ / ANZ sheets.
// Columns: C=Serial, D=Ward, E=RegNo, F=Coverage%, G=Distance, H=AvgSpeed, I=Remarks
type ZoneRow struct {
	Ward            string
	RegistrationNo  string
	CoveragePercent float64  // 0–100
	Distance        float64  // km
	AverageSpeed    float64  // km/h
	Remarks         string   // empty, "GPS TAMPERED", "NOT WORKED", etc.
}

// SWRow is one row in the SW (Sweeping) sheet.
// Columns: C=Serial, D=Ward, E=RegNo, F=StartTime, G=EndTime, H=ActiveHours, I=Distance, J=AvgSpeed, K=Remarks
type SWRow struct {
	Ward           string
	RegistrationNo string
	StartTime      *time.Time
	EndTime        *time.Time
	ActiveHours    string  // "HH:MM:SS"
	Distance       float64
	AverageSpeed   float64
	Remarks        string
	ZoneCode       string
}

// DepartedRow is one row in the DEPARTED sheet.
// Columns: A=Key(hidden), B=Serial, C=Zone, D=Ward, E=RegNo, F=StartTime, G=EndTime, H=ActiveHours, I=Distance
type DepartedRow struct {
	Zone           string
	Ward           string
	RegistrationNo string
	StartTime      *time.Time
	EndTime        *time.Time
	ActiveHours    string
	Distance       float64
}

// EARRow is one row in the EAR (Early Departure) sheet.
// Columns: A=Serial, B=Zone, C=Ward, D=RegNo, E=StartTime, F=EndTime, G=ActiveHours, H=Distance
// Rule: EndTime < 13:00 IST
type EARRow struct {
	Zone           string
	Ward           string
	RegistrationNo string
	StartTime      *time.Time
	EndTime        *time.Time
	ActiveHours    string
	Distance       float64
}

// ZoneSummary is one row in the SUM sheet (D2D section, rows 6–9).
// Columns: B=Serial, C=Zone, D=NoOfHoppers, E=NotWorked, F=CoveredPct, G=Distance, H=Trips
type ZoneSummary struct {
	ZoneName     string
	NoOfHoppers  int
	NotWorked    int
	AvgCoverage  float64 // AVG(coverage_percentage) across zone
	AvgDistance  float64 // AVG(distance) — note: Excel label says "Total" but it's average
	Trips        int
}

// SWSummary is one row in the SUM sheet (Sweeping section, rows 14–17).
type SWSummary struct {
	ZoneName    string
	NoOfHoppers int
	NotWorked   int
	AvgDistance float64
	Trips       int
}

// ReportData is the fully assembled input to the Excel engine.
// All business logic has already been applied; the engine only injects values.
type ReportData struct {
	ReportDate  time.Time
	DateLabel   string // "Friday, June 05, 2026"

	// Raw data sheets
	RawMovements []RawMovementInfo
	RawCoverages []RawCoverageInfo

	// Zone sheets (D2D Hoppers)
	HMZ []ZoneRow
	CLZ []ZoneRow
	KPZ []ZoneRow
	ANZ []ZoneRow

	// Sweeping sheet
	SW []SWRow

	// Departed & EAR
	Departed []DepartedRow
	EAR      []EARRow

	// Summary sheet
	D2DSummary []ZoneSummary // 4 zones: HMZ, CLZ, KPZ, ANZ
	SWSummary  []SWSummary   // 4 zones

	// Totals row (row 10 in SUM sheet)
	TotalD2DHoppers int
	TotalNotWorked  int
	OverallAvgCov   float64
	OverallAvgDist  float64
	TotalTrips      int
}

type RawMovementInfo struct {
	RegistrationNo string
	StartTime      *time.Time
	EndTime        *time.Time
	ActiveHours    string
	Distance       float64
	AverageSpeed   float64
}

type RawCoverageInfo struct {
	Key             string
	RegistrationNo  string
	CoveragePercent float64
}
