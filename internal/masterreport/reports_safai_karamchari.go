// reports_safai_karamchari.go registers two reports:
//
//	safai_karamchari_worked  (#19, 18:00) — wraps GetAttendance (role=safai_karamchari)
//	beet_sweeping_summary    (#20, 18:10) — rollup of safai_karamchari_worked (same handler, summary)
//
// See docs/master-reports-catalog.md §§ 19, 20. Compute closures live in
// cmd/server/main.go.
package masterreport

import "time"

// -----------------------------------------------------------------------------
// safai_karamchari_worked (#19)
// -----------------------------------------------------------------------------

// RegisterSafaiKaramchariWorked registers the per-employee street-cleaning
// record (catalog #19, 06:00 PM).
func RegisterSafaiKaramchariWorked(catalog *Catalog, compute ExistingComputeFunc, version ExistingInputVersionFunc) {
	// Keys match AttendanceResponse JSON tags from GetAttendance handler.
	cols := []ColumnSpec{
		{Key: "employee_id", Header: "Employee ID", WidthMM: 24, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "employee_name", Header: "EMPLOYEE", WidthMM: 40, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "role", Header: "ROLE", WidthMM: 22, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "shift_name", Header: "SHIFT", WidthMM: 24, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "vehicle_no", Header: "VEHICLE", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "helper_present", Header: "PRESENT", WidthMM: 22, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "punch_in_at", Header: "PUNCH IN", WidthMM: 32, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "punch_out_at", Header: "PUNCH OUT", WidthMM: 32, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "ward_name", Header: "WARD", WidthMM: 28, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "is_valid", Header: "VALID", WidthMM: 18, Type: "text", Align: "center", FillHex: "#FFD966"},
	}
	def := &ReportDefinition{
		ID:            ReportID("safai_karamchari_worked"),
		Name:          "Safai Karamchari Worked Report",
		Category:      CategoryAttendance,
		ScheduledTime: 18 * time.Hour,
		DisplayOrder:  280,
		Description:   "Per-employee street-cleaning attendance from the mobile app.",
		Filters: []FilterControl{
			{Key: FilterDate, Required: true},
			{Key: FilterZone, Required: false},
			{Key: FilterWard, Required: false},
			{Key: FilterEmployee, Required: false},
		},
		PermissionKey: "reports.safai_karamchari_worked.view",
		DataSource:    NewExistingHandlerAdapter(compute, version),
		Preview: PreviewLayout{
			Columns:      cols,
			TotalWidthMM: totalWidthMM(cols),
		},
	}
	catalog.MustRegister(def)
}

// -----------------------------------------------------------------------------
// beet_sweeping_summary (#20)
// -----------------------------------------------------------------------------

// RegisterBeetSweepingSummary registers the per-zone rollup of beet
// (street-sweeping subdivision) activity (catalog #20, 06:10 PM).
func RegisterBeetSweepingSummary(catalog *Catalog, compute ExistingComputeFunc, version ExistingInputVersionFunc) {
	// Keys match AttendanceResponse JSON tags from GetAttendance handler.
	cols := []ColumnSpec{
		{Key: "employee_id", Header: "Employee ID", WidthMM: 24, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "employee_name", Header: "EMPLOYEE", WidthMM: 40, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "role", Header: "ROLE", WidthMM: 22, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "shift_name", Header: "SHIFT", WidthMM: 24, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "vehicle_no", Header: "VEHICLE", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "helper_present", Header: "PRESENT", WidthMM: 22, Type: "text", Align: "center", FillHex: "#C6E0B4"},
		{Key: "punch_in_at", Header: "PUNCH IN", WidthMM: 32, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "punch_out_at", Header: "PUNCH OUT", WidthMM: 32, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "ward_name", Header: "WARD", WidthMM: 28, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "is_valid", Header: "VALID", WidthMM: 18, Type: "text", Align: "center", FillHex: "#FFD966"},
	}
	def := &ReportDefinition{
		ID:            ReportID("beet_sweeping_summary"),
		Name:          "Beet Sweeping Summary",
		Category:      CategoryRoadSweeping,
		ScheduledTime: 18*time.Hour + 10*time.Minute,
		DisplayOrder:  290,
		Description:   "Per-zone rollup of beet (segment) sweeping attendance activity.",
		Filters: []FilterControl{
			{Key: FilterDate, Required: true},
			{Key: FilterFirm, Required: false},
		},
		PermissionKey: "reports.beet_sweeping_summary.view",
		DataSource:    NewExistingHandlerAdapter(compute, version),
		Preview: PreviewLayout{
			Columns:      cols,
			TotalWidthMM: totalWidthMM(cols),
		},
	}
	catalog.MustRegister(def)
}
