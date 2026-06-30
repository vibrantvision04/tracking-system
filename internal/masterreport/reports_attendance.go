// Package masterreport contains the Master Consolidated Reporting Module.
//
// reports_attendance.go registers four attendance reports:
//
//	helper_attendance                (#4,  08:00) — wraps GetAttendance (helper)
//	helper_attendance_summary        (#5,  08:01) — rollup of helper_attendance (new aggregation)
//	govt_street_sweeper_attendance   (#7,  10:15) — wraps GetAttendance (safai_karamchari)
//	street_sweeper_summary           (#8,  10:16) — rollup of govt_street_sweeper_attendance (new aggregation)
//
// See docs/master-reports-catalog.md §§ 4, 5, 7, 8 for column / totals /
// remarks spec. Compute closures live in cmd/server/main.go.
package masterreport

import "time"

// -----------------------------------------------------------------------------
// helper_attendance (#4)
// -----------------------------------------------------------------------------

// RegisterHelperAttendance registers the per-vehicle helper attendance
// detail report (catalog #4, 08:00 AM).
func RegisterHelperAttendance(catalog *Catalog, compute ExistingComputeFunc, version ExistingInputVersionFunc) {
	// Keys match AttendanceResponse JSON tags from GetAttendance handler.
	cols := []ColumnSpec{
		{Key: "employee_id", Header: "Employee ID", WidthMM: 24, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "employee_name", Header: "EMPLOYEE", WidthMM: 35, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "role", Header: "ROLE", WidthMM: 22, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "shift_name", Header: "SHIFT", WidthMM: 24, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "vehicle_no", Header: "VEHICLE REG. NO.", WidthMM: 35, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "helper_name", Header: "HELPER", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "helper_present", Header: "HELPER PRESENT", WidthMM: 28, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "punch_in_at", Header: "PUNCH IN", WidthMM: 32, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "punch_out_at", Header: "PUNCH OUT", WidthMM: 32, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "is_valid", Header: "VALID", WidthMM: 18, Type: "text", Align: "center", FillHex: "#FFD966"},
	}
	def := &ReportDefinition{
		ID:            ReportID("helper_attendance"),
		Name:          "Helper Attendance (per-vehicle)",
		Category:      CategoryAttendance,
		ScheduledTime: 8 * time.Hour,
		DisplayOrder:  130,
		Description:   "Per-vehicle helper-on-vehicle attendance check at 08:00 AM.",
		Filters: []FilterControl{
			{Key: FilterDate, Required: true},
			{Key: FilterZone, Required: false},
		},
		PermissionKey: "reports.helper_attendance.view",
		DataSource:    NewExistingHandlerAdapter(compute, version),
		Preview: PreviewLayout{
			Columns:      cols,
			TotalWidthMM: totalWidthMM(cols),
		},
	}
	catalog.MustRegister(def)
}

// -----------------------------------------------------------------------------
// helper_attendance_summary (#5)
// -----------------------------------------------------------------------------

// RegisterHelperAttendanceSummary registers the zone × firm rollup of
// helper_attendance (catalog #5, 08:01 AM).
func RegisterHelperAttendanceSummary(catalog *Catalog, compute ExistingComputeFunc, version ExistingInputVersionFunc) {
	// Keys match AttendanceResponse JSON tags from GetAttendance handler.
	cols := []ColumnSpec{
		{Key: "employee_id", Header: "Employee ID", WidthMM: 24, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "employee_name", Header: "EMPLOYEE NAME", WidthMM: 40, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "role", Header: "ROLE", WidthMM: 22, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "shift_name", Header: "SHIFT", WidthMM: 24, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "vehicle_no", Header: "VEHICLE", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "helper_name", Header: "HELPER", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "helper_present", Header: "HELPER PRESENT", WidthMM: 30, Type: "text", Align: "center", FillHex: "#C6E0B4"},
		{Key: "punch_in_at", Header: "PUNCH IN", WidthMM: 32, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "punch_out_at", Header: "PUNCH OUT", WidthMM: 32, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "is_valid", Header: "VALID", WidthMM: 18, Type: "text", Align: "center", FillHex: "#FFD966"},
	}
	def := &ReportDefinition{
		ID:            ReportID("helper_attendance_summary"),
		Name:          "Helper Attendance Summary",
		Category:      CategoryAttendance,
		ScheduledTime: 8*time.Hour + 1*time.Minute,
		DisplayOrder:  140,
		Description:   "Zone × firm rollup of helper attendance.",
		Filters: []FilterControl{
			{Key: FilterDate, Required: true},
			{Key: FilterZone, Required: false},
			{Key: FilterFirm, Required: false},
		},
		PermissionKey: "reports.helper_attendance_summary.view",
		DataSource:    NewExistingHandlerAdapter(compute, version),
		Preview: PreviewLayout{
			Columns:      cols,
			TotalWidthMM: totalWidthMM(cols),
		},
	}
	catalog.MustRegister(def)
}

// -----------------------------------------------------------------------------
// govt_street_sweeper_attendance (#7)
// -----------------------------------------------------------------------------

// RegisterGovtStreetSweeperAttendance registers the per-ward attendance
// of municipal street-sweeping employees (catalog #7, 10:15 AM).
func RegisterGovtStreetSweeperAttendance(catalog *Catalog, compute ExistingComputeFunc, version ExistingInputVersionFunc) {
	// Keys match AttendanceResponse JSON tags from GetAttendance handler.
	cols := []ColumnSpec{
		{Key: "employee_id", Header: "Employee ID", WidthMM: 24, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "employee_name", Header: "EMPLOYEE NAME", WidthMM: 48, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "role", Header: "ROLE", WidthMM: 22, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "shift_name", Header: "SHIFT", WidthMM: 24, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "vehicle_no", Header: "VEHICLE", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "helper_present", Header: "PRESENT", WidthMM: 22, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "punch_in_at", Header: "PUNCH IN", WidthMM: 32, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "punch_out_at", Header: "PUNCH OUT", WidthMM: 32, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "is_valid", Header: "VALID", WidthMM: 18, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "ward_name", Header: "WARD", WidthMM: 28, Type: "text", Align: "left", FillHex: "#FFD966"},
	}
	def := &ReportDefinition{
		ID:            ReportID("govt_street_sweeper_attendance"),
		Name:          "Govt. Employee Street Sweeper Attendance",
		Category:      CategoryAttendance,
		ScheduledTime: 10*time.Hour + 15*time.Minute,
		DisplayOrder:  160,
		Description:   "Per-ward attendance of municipal street-sweeping employees (Safai Karamchari).",
		Filters: []FilterControl{
			{Key: FilterDate, Required: true},
			{Key: FilterZone, Required: false},
			{Key: FilterWard, Required: false},
		},
		PermissionKey: "reports.govt_street_sweeper_attendance.view",
		DataSource:    NewExistingHandlerAdapter(compute, version),
		Preview: PreviewLayout{
			Columns:      cols,
			TotalWidthMM: totalWidthMM(cols),
		},
	}
	catalog.MustRegister(def)
}

// -----------------------------------------------------------------------------
// street_sweeper_summary (#8)
// -----------------------------------------------------------------------------

// RegisterStreetSweeperSummary registers the zone rollup of
// govt_street_sweeper_attendance (catalog #8, 10:16 AM).
func RegisterStreetSweeperSummary(catalog *Catalog, compute ExistingComputeFunc, version ExistingInputVersionFunc) {
	// Keys match AttendanceResponse JSON tags from GetAttendance handler.
	cols := []ColumnSpec{
		{Key: "employee_id", Header: "Employee ID", WidthMM: 24, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "employee_name", Header: "EMPLOYEE NAME", WidthMM: 40, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "role", Header: "ROLE", WidthMM: 22, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "shift_name", Header: "SHIFT", WidthMM: 24, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "vehicle_no", Header: "VEHICLE", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "helper_present", Header: "PRESENT", WidthMM: 22, Type: "text", Align: "center", FillHex: "#C6E0B4"},
		{Key: "punch_in_at", Header: "PUNCH IN", WidthMM: 32, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "punch_out_at", Header: "PUNCH OUT", WidthMM: 32, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "is_valid", Header: "VALID", WidthMM: 18, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "ward_name", Header: "WARD", WidthMM: 28, Type: "text", Align: "left", FillHex: "#FFD966"},
	}
	def := &ReportDefinition{
		ID:            ReportID("street_sweeper_summary"),
		Name:          "Street Sweeper Attendance Summary",
		Category:      CategoryAttendance,
		ScheduledTime: 10*time.Hour + 16*time.Minute,
		DisplayOrder:  170,
		Description:   "Zone rollup of govt_street_sweeper_attendance.",
		Filters: []FilterControl{
			{Key: FilterDate, Required: true},
			{Key: FilterZone, Required: false},
		},
		PermissionKey: "reports.street_sweeper_summary.view",
		DataSource:    NewExistingHandlerAdapter(compute, version),
		Preview: PreviewLayout{
			Columns:      cols,
			TotalWidthMM: totalWidthMM(cols),
		},
	}
	catalog.MustRegister(def)
}
