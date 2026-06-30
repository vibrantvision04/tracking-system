// reports_street_sweeping.go registers two street-sweeping reports:
//
//	street_sweeping_detail   (#15, 16:15) — wraps GetD2DRouteCoverageReport(route_type=sweeping)
//	street_sweeping_summary  (#16, 16:16) — rollup of street_sweeping_detail (same handler, no zone filter)
//
// See docs/master-reports-catalog.md §§ 15, 16. Compute closures live in
// cmd/server/main.go.
package masterreport

import "time"

// -----------------------------------------------------------------------------
// street_sweeping_detail (#15)
// -----------------------------------------------------------------------------

// RegisterStreetSweepingDetail registers the per-vehicle street-sweeping
// detail report (catalog #15, 04:15 PM).
func RegisterStreetSweepingDetail(catalog *Catalog, compute ExistingComputeFunc, version ExistingInputVersionFunc) {
	// Keys match CoverageReportRow JSON tags from GetD2DRouteCoverageReport handler.
	cols := []ColumnSpec{
		{Key: "vehicle_reg_no", Header: "VEHICLE REG. NO.", WidthMM: 35, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "zone_name", Header: "ZONE", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "ward_name", Header: "Ward", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "route_name", Header: "ROUTE", WidthMM: 35, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "covered_percentage", Header: "COVERED %", WidthMM: 24, Type: "decimal2", Align: "right", FillHex: "#C6E0B4"},
		{Key: "in_order_percentage", Header: "In-Order %", WidthMM: 24, Type: "decimal2", Align: "right", FillHex: "#FFD966"},
		{Key: "total_checkpoints", Header: "Total Checkpoints", WidthMM: 30, Type: "int", Align: "right", FillHex: "#FFD966"},
		{Key: "date", Header: "Date", WidthMM: 24, Type: "text", Align: "center", FillHex: "#FFD966"},
	}
	def := &ReportDefinition{
		ID:            ReportID("street_sweeping_detail"),
		Name:          "Street Sweeping Hopper Detail",
		Category:      CategoryRoadSweeping,
		ScheduledTime: 16*time.Hour + 15*time.Minute,
		DisplayOrder:  240,
		Description:   "Per-vehicle street-sweeping coverage detail.",
		Filters: []FilterControl{
			{Key: FilterDate, Required: true},
			{Key: FilterZone, Required: true},
			{Key: FilterFirm, Required: false},
		},
		PermissionKey: "reports.street_sweeping_detail.view",
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
// street_sweeping_summary (#16)
// -----------------------------------------------------------------------------

// RegisterStreetSweepingSummary registers the zone × firm rollup of
// street_sweeping_detail (catalog #16, 04:16 PM).
func RegisterStreetSweepingSummary(catalog *Catalog, compute ExistingComputeFunc, version ExistingInputVersionFunc) {
	// Keys match CoverageReportRow JSON tags from GetD2DRouteCoverageReport handler.
	cols := []ColumnSpec{
		{Key: "vehicle_reg_no", Header: "VEHICLE REG. NO.", WidthMM: 35, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "zone_name", Header: "ZONE", WidthMM: 32, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "ward_name", Header: "WARD", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "route_name", Header: "ROUTE", WidthMM: 34, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "covered_percentage", Header: "COVERED %", WidthMM: 24, Type: "decimal2", Align: "right", FillHex: "#C6E0B4"},
		{Key: "in_order_percentage", Header: "In-Order %", WidthMM: 24, Type: "decimal2", Align: "right", FillHex: "#FFD966"},
		{Key: "total_checkpoints", Header: "Total Checkpoints", WidthMM: 30, Type: "int", Align: "right", FillHex: "#FFD966"},
	}
	def := &ReportDefinition{
		ID:            ReportID("street_sweeping_summary"),
		Name:          "All Zones Street Sweeping Summary",
		Category:      CategoryRoadSweeping,
		ScheduledTime: 16*time.Hour + 16*time.Minute,
		DisplayOrder:  250,
		Description:   "Rollup of street_sweeping_detail by zone × firm.",
		Filters: []FilterControl{
			{Key: FilterDate, Required: true},
			{Key: FilterFirm, Required: false},
		},
		PermissionKey: "reports.street_sweeping_summary.view",
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
