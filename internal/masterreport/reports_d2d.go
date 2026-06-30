// Package masterreport contains the Master Consolidated Reporting Module.
//
// reports_d2d.go registers seven D2D / commercial-hopper reports:
//
//	d2d_vehicle_coverage          (#13, 16:10) — wraps GetD2DRouteCoverageReport
//	d2d_zone_summary              (#14, 16:11) — rollup of d2d_vehicle_coverage (new aggregation)
//	d2d_working_check             (#17, 16:30) — wraps GetActiveVehicleSummaryReport + helper join
//	commercial_hopper_summary     (#18, 16:31) — rollup of d2d_working_check (new aggregation)
//	evening_d2d_check             (#24, 20:15) — same compute as #17, evening cutoff
//	evening_commercial_detail     (#25, 23:10) — wraps GetVehicleSummaryReport(purpose=commercial_evening)
//	evening_commercial_summary    (#26, 23:15) — rollup of evening_commercial_detail (new aggregation)
//
// See docs/master-reports-catalog.md §§ 13, 14, 17, 18, 24, 25, 26 for the
// canonical column / totals / remarks spec. Compute closures live in
// cmd/server/main.go.
package masterreport

import "time"

// -----------------------------------------------------------------------------
// d2d_vehicle_coverage (#13)
// -----------------------------------------------------------------------------

// RegisterD2DVehicleCoverage registers the per-vehicle D2D coverage detail
// by ward and zone (catalog #13, 04:10 PM). The most data-dense report
// in the catalog.
func RegisterD2DVehicleCoverage(catalog *Catalog, compute ExistingComputeFunc, version ExistingInputVersionFunc) {
	// Keys match CoverageReportRow JSON tags from GetD2DRouteCoverageReport handler.
	cols := []ColumnSpec{
		{Key: "ward_name", Header: "Ward", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "vehicle_reg_no", Header: "VEHICLE REG. NO.", WidthMM: 35, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "covered_percentage", Header: "COVERED %", WidthMM: 24, Type: "decimal2", Align: "right", FillHex: "#C6E0B4"},
		{Key: "total_checkpoints", Header: "Total Checkpoints", WidthMM: 32, Type: "int", Align: "right", FillHex: "#FFD966"},
		{Key: "in_order_percentage", Header: "In-Order %", WidthMM: 24, Type: "decimal2", Align: "right", FillHex: "#FFD966"},
		{Key: "zone_name", Header: "ZONE", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "route_name", Header: "ROUTE", WidthMM: 35, Type: "text", Align: "left", FillHex: "#FFD966"},
	}
	def := &ReportDefinition{
		ID:            ReportID("d2d_vehicle_coverage"),
		Name:          "D2D Vehicle Coverage by Ward (detail)",
		Category:      CategoryZoneCoverage,
		ScheduledTime: 16*time.Hour + 10*time.Minute,
		DisplayOrder:  220,
		Description:   "Per-vehicle D2D coverage detail by ward and zone: covered %, distance, average speed, trips, with derived remarks.",
		Filters: []FilterControl{
			{Key: FilterDate, Required: true},
			{Key: FilterZone, Required: true},
			{Key: FilterFirm, Required: false},
		},
		PermissionKey: "reports.d2d_vehicle_coverage.view",
		DataSource:    NewExistingHandlerAdapter(compute, version),
		Preview: PreviewLayout{
			Columns: cols,
			ColorRules: []ColorRule{
				{ColumnKey: "covered_percentage", Operator: "lt", Value: float64(70), FillHex: "#F4B6B6"},
				{ColumnKey: "covered_percentage", Operator: "ge", Value: float64(90), FillHex: "#C6EFCE"},
			},
			TotalsRows: []TotalsRow{
				{
					Position: -1,
					Label:    "GRAND TOTAL",
					Values: map[string]any{
						"covered_percentage": "weighted_avg",
						"total_checkpoints":  "sum",
					},
					FillHex: "#BDD7EE",
				},
			},
			TotalWidthMM: totalWidthMM(cols),
		},
	}
	catalog.MustRegister(def)
}

// -----------------------------------------------------------------------------
// d2d_zone_summary (#14)
// -----------------------------------------------------------------------------

// RegisterD2DZoneSummary registers the zone × firm rollup of
// d2d_vehicle_coverage (catalog #14, 04:11 PM). New aggregation —
// Phase D will supply the SQL via the compute closure.
func RegisterD2DZoneSummary(catalog *Catalog, compute ExistingComputeFunc, version ExistingInputVersionFunc) {
	// Keys match CoverageReportRow JSON tags from GetD2DRouteCoverageReport handler.
	cols := []ColumnSpec{
		{Key: "zone_name", Header: "ZONE", WidthMM: 32, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "vehicle_reg_no", Header: "VEHICLE REG. NO.", WidthMM: 35, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "ward_name", Header: "WARD", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "route_name", Header: "ROUTE", WidthMM: 34, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "covered_percentage", Header: "COVERED %", WidthMM: 24, Type: "decimal2", Align: "right", FillHex: "#C6E0B4"},
		{Key: "in_order_percentage", Header: "In-Order %", WidthMM: 24, Type: "decimal2", Align: "right", FillHex: "#FFD966"},
		{Key: "total_checkpoints", Header: "Total Checkpoints", WidthMM: 32, Type: "int", Align: "right", FillHex: "#FFD966"},
	}
	def := &ReportDefinition{
		ID:            ReportID("d2d_zone_summary"),
		Name:          "All Zones D2D Hoppers Summary",
		Category:      CategoryZoneCoverage,
		ScheduledTime: 16*time.Hour + 11*time.Minute,
		DisplayOrder:  230,
		Description:   "Rollup of d2d_vehicle_coverage by zone × firm. Counts summed; covered % is the weighted average over total_d2d_hoppers.",
		Filters: []FilterControl{
			{Key: FilterDate, Required: true},
			{Key: FilterFirm, Required: false},
		},
		PermissionKey: "reports.d2d_zone_summary.view",
		DataSource:    NewExistingHandlerAdapter(compute, version),
		Preview: PreviewLayout{
			Columns: cols,
			TotalsRows: []TotalsRow{
				{
					Position: -1,
					Label:    "AVERAGE/TOTAL",
					Values: map[string]any{
						"covered_percentage":  "weighted_avg",
						"in_order_percentage": "weighted_avg",
						"total_checkpoints":   "sum",
					},
					FillHex: "#BDD7EE",
				},
			},
			TotalWidthMM: totalWidthMM(cols),
		},
	}
	catalog.MustRegister(def)
}

// -----------------------------------------------------------------------------
// d2d_working_check (#17)
// -----------------------------------------------------------------------------

// d2dWorkingCheckColumns is the shared column shape used by both the
// afternoon (#17) and evening (#24) working-check reports.
// Keys match ActiveVehicleSummaryRow JSON tags from GetActiveVehicleSummaryReport handler.
func d2dWorkingCheckColumns() []ColumnSpec {
	return []ColumnSpec{
		{Key: "zone_name", Header: "ZONE", WidthMM: 32, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "total_vehicles", Header: "TOTAL VEHICLES", WidthMM: 30, Type: "int", Align: "right", FillHex: "#FFD966"},
		{Key: "active_vehicles", Header: "ACTIVE VEHICLES", WidthMM: 34, Type: "int", Align: "right", FillHex: "#C6E0B4"},
		{Key: "inactive_vehicles", Header: "INACTIVE VEHICLES", WidthMM: 34, Type: "int", Align: "right", FillHex: "#F4B6B6"},
	}
}

// d2dWorkingCheckTotals is the shared totals row used by both the
// afternoon (#17) and evening (#24) working-check reports.
func d2dWorkingCheckTotals() []TotalsRow {
	return []TotalsRow{
		{
			Position: -1,
			Label:    "TOTAL",
			Values: map[string]any{
				"total_vehicles":    "sum",
				"active_vehicles":   "sum",
				"inactive_vehicles": "sum",
			},
			FillHex: "#BDD7EE",
		},
	}
}

// RegisterD2DWorkingCheck registers the end-of-day D2D working check
// (catalog #17, 04:30 PM).
func RegisterD2DWorkingCheck(catalog *Catalog, compute ExistingComputeFunc, version ExistingInputVersionFunc) {
	cols := d2dWorkingCheckColumns()
	def := &ReportDefinition{
		ID:            ReportID("d2d_working_check"),
		Name:          "D2D Hopper Working Check",
		Category:      CategoryZoneCoverage,
		ScheduledTime: 16*time.Hour + 30*time.Minute,
		DisplayOrder:  260,
		Description:   "End-of-day check whether each D2D vehicle has worked and whether the helper was present. Boolean status per vehicle.",
		Filters: []FilterControl{
			{Key: FilterDate, Required: true},
			{Key: FilterZone, Required: true},
			{Key: FilterFirm, Required: false},
		},
		PermissionKey: "reports.d2d_working_check.view",
		DataSource:    NewExistingHandlerAdapter(compute, version),
		Preview: PreviewLayout{
			Columns:      cols,
			TotalsRows:   d2dWorkingCheckTotals(),
			TotalWidthMM: totalWidthMM(cols),
		},
	}
	catalog.MustRegister(def)
}

// -----------------------------------------------------------------------------
// commercial_hopper_summary (#18)
// -----------------------------------------------------------------------------

// RegisterCommercialHopperSummary registers the all-zones D2D commercial
// hoppers summary (catalog #18, 04:31 PM). New aggregation — Phase D will
// supply the SQL via the compute closure.
func RegisterCommercialHopperSummary(catalog *Catalog, compute ExistingComputeFunc, version ExistingInputVersionFunc) {
	// Keys match ActiveVehicleSummaryRow JSON tags from GetActiveVehicleSummaryReport handler.
	cols := []ColumnSpec{
		{Key: "zone_name", Header: "ZONE", WidthMM: 32, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "total_vehicles", Header: "TOTAL VEHICLES", WidthMM: 36, Type: "int", Align: "right", FillHex: "#FFD966"},
		{Key: "active_vehicles", Header: "ACTIVE VEHICLES", WidthMM: 34, Type: "int", Align: "right", FillHex: "#C6E0B4"},
		{Key: "inactive_vehicles", Header: "INACTIVE VEHICLES", WidthMM: 34, Type: "int", Align: "right", FillHex: "#F4B6B6"},
	}
	def := &ReportDefinition{
		ID:            ReportID("commercial_hopper_summary"),
		Name:          "All Zones D2D Commercial Hoppers Summary",
		Category:      CategoryZoneCoverage,
		ScheduledTime: 16*time.Hour + 31*time.Minute,
		DisplayOrder:  270,
		Description:   "Zone × firm rollup of commercial hoppers vs total, not-working count, and helper-present count.",
		Filters: []FilterControl{
			{Key: FilterDate, Required: true},
			{Key: FilterFirm, Required: false},
		},
		PermissionKey: "reports.commercial_hopper_summary.view",
		DataSource:    NewExistingHandlerAdapter(compute, version),
		Preview: PreviewLayout{
			Columns: cols,
			TotalsRows: []TotalsRow{
				{
					Position: -1,
					Label:    "AVERAGE/TOTAL",
					Values: map[string]any{
						"total_vehicles":    "sum",
						"active_vehicles":   "sum",
						"inactive_vehicles": "sum",
					},
					FillHex: "#BDD7EE",
				},
			},
			TotalWidthMM: totalWidthMM(cols),
		},
	}
	catalog.MustRegister(def)
}

// -----------------------------------------------------------------------------
// evening_d2d_check (#24)
// -----------------------------------------------------------------------------

// RegisterEveningD2DCheck registers the evening counterpart of
// d2d_working_check with cutoff at 08:00 PM, including all vehicle types
// (commercial + residential) per catalog § 24.
func RegisterEveningD2DCheck(catalog *Catalog, compute ExistingComputeFunc, version ExistingInputVersionFunc) {
	cols := d2dWorkingCheckColumns()
	def := &ReportDefinition{
		ID:            ReportID("evening_d2d_check"),
		Name:          "Evening D2D Working Check",
		Category:      CategoryZoneCoverage,
		ScheduledTime: 20*time.Hour + 15*time.Minute,
		DisplayOrder:  330,
		Description:   "Evening counterpart of d2d_working_check with the 08:00 PM cutoff, including all vehicle types (commercial + residential).",
		Filters: []FilterControl{
			{Key: FilterDate, Required: true},
			{Key: FilterZone, Required: true},
			{Key: FilterFirm, Required: false},
		},
		PermissionKey: "reports.evening_d2d_check.view",
		DataSource:    NewExistingHandlerAdapter(compute, version),
		Preview: PreviewLayout{
			Columns:      cols,
			TotalsRows:   d2dWorkingCheckTotals(),
			TotalWidthMM: totalWidthMM(cols),
		},
	}
	catalog.MustRegister(def)
}

// -----------------------------------------------------------------------------
// evening_commercial_detail (#25)
// -----------------------------------------------------------------------------

// RegisterEveningCommercialDetail registers the per-vehicle evening
// commercial-shift detail (catalog #25, 11:10 PM). Same column shape as
// street_sweeping_detail per the workbook.
func RegisterEveningCommercialDetail(catalog *Catalog, compute ExistingComputeFunc, version ExistingInputVersionFunc) {
	// Keys match CoverageReportRow JSON tags from GetD2DRouteCoverageReport handler.
	cols := []ColumnSpec{
		{Key: "ward_name", Header: "Ward", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "vehicle_reg_no", Header: "VEHICLE REG. NO.", WidthMM: 35, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "zone_name", Header: "ZONE", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "route_name", Header: "ROUTE", WidthMM: 35, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "covered_percentage", Header: "COVERED %", WidthMM: 24, Type: "decimal2", Align: "right", FillHex: "#C6E0B4"},
		{Key: "in_order_percentage", Header: "In-Order %", WidthMM: 24, Type: "decimal2", Align: "right", FillHex: "#FFD966"},
		{Key: "total_checkpoints", Header: "Total Checkpoints", WidthMM: 32, Type: "int", Align: "right", FillHex: "#FFD966"},
	}
	def := &ReportDefinition{
		ID:            ReportID("evening_commercial_detail"),
		Name:          "Evening Commercial Hoppers Detail",
		Category:      CategoryZoneCoverage,
		ScheduledTime: 23*time.Hour + 10*time.Minute,
		DisplayOrder:  340,
		Description:   "Per-vehicle evening commercial-shift detail (04:00 AM–11:00 PM window per the workbook banner).",
		Filters: []FilterControl{
			{Key: FilterDate, Required: true},
			{Key: FilterZone, Required: true},
			{Key: FilterFirm, Required: false},
		},
		PermissionKey: "reports.evening_commercial_detail.view",
		DataSource:    NewExistingHandlerAdapter(compute, version),
		Preview: PreviewLayout{
			Columns: cols,
			TotalsRows: []TotalsRow{
				{
					Position: -1,
					Label:    "GRAND TOTAL",
					Values: map[string]any{
						"covered_percentage": "weighted_avg",
						"total_checkpoints":  "sum",
					},
					FillHex: "#BDD7EE",
				},
			},
			TotalWidthMM: totalWidthMM(cols),
		},
	}
	catalog.MustRegister(def)
}

// -----------------------------------------------------------------------------
// evening_commercial_summary (#26)
// -----------------------------------------------------------------------------

// RegisterEveningCommercialSummary registers the all-zones rollup of
// evening_commercial_detail (catalog #26, 11:15 PM). New aggregation —
// Phase D will supply the SQL via the compute closure.
func RegisterEveningCommercialSummary(catalog *Catalog, compute ExistingComputeFunc, version ExistingInputVersionFunc) {
	// Keys match CoverageReportRow JSON tags from GetD2DRouteCoverageReport handler.
	cols := []ColumnSpec{
		{Key: "zone_name", Header: "ZONE", WidthMM: 32, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "vehicle_reg_no", Header: "VEHICLE REG. NO.", WidthMM: 35, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "ward_name", Header: "WARD", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "route_name", Header: "ROUTE", WidthMM: 34, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "covered_percentage", Header: "COVERED %", WidthMM: 24, Type: "decimal2", Align: "right", FillHex: "#C6E0B4"},
		{Key: "in_order_percentage", Header: "In-Order %", WidthMM: 24, Type: "decimal2", Align: "right", FillHex: "#FFD966"},
		{Key: "total_checkpoints", Header: "Total Checkpoints", WidthMM: 32, Type: "int", Align: "right", FillHex: "#FFD966"},
	}
	def := &ReportDefinition{
		ID:            ReportID("evening_commercial_summary"),
		Name:          "All Zones Evening Commercial Hoppers Summary",
		Category:      CategoryZoneCoverage,
		ScheduledTime: 23*time.Hour + 15*time.Minute,
		DisplayOrder:  350,
		Description:   "All-zones rollup of evening commercial hopper activity by zone × firm. Same shape as d2d_zone_summary, evening cutoff.",
		Filters: []FilterControl{
			{Key: FilterDate, Required: true},
			{Key: FilterFirm, Required: false},
		},
		PermissionKey: "reports.evening_commercial_summary.view",
		DataSource:    NewExistingHandlerAdapter(compute, version),
		Preview: PreviewLayout{
			Columns: cols,
			TotalsRows: []TotalsRow{
				{
					Position: -1,
					Label:    "AVERAGE/TOTAL",
					Values: map[string]any{
						"covered_percentage":  "weighted_avg",
						"in_order_percentage": "weighted_avg",
						"total_checkpoints":   "sum",
					},
					FillHex: "#BDD7EE",
				},
			},
			TotalWidthMM: totalWidthMM(cols),
		},
	}
	catalog.MustRegister(def)
}
