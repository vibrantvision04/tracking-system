// Package masterreport contains the Master Consolidated Reporting Module.
//
// reports_road_sweeping.go registers the road-sweeping bucket entry —
// `road_sweeping` (catalog #1). See `docs/master-reports-catalog.md` § 1
// for the canonical column / totals / remarks spec; this file holds only
// the in-code metadata.
//
// The compute / version closures are constructed in cmd/server/main.go so
// the package never imports internal/api (cycle-free design — see
// adapter_existing.go for the long-form rationale).
package masterreport

import "time"

// totalWidthMM sums the WidthMM of every column. Shared helper used by
// every reports_*.go file so the PreviewLayout.TotalWidthMM value cannot
// drift away from the column slice it is computed from.
func totalWidthMM(cols []ColumnSpec) float64 {
	var total float64
	for _, c := range cols {
		total += c.WidthMM
	}
	return total
}

// roadSweepingColumns returns the column descriptors for the road-sweeping
// report. Keys match the map[string]interface{} keys returned by
// GetShiftBasedOpsReport handler.
func roadSweepingColumns() []ColumnSpec {
	return []ColumnSpec{
		{Key: "vehicle_id", Header: "Vehicle ID", WidthMM: 20, Type: "int", Align: "center", FillHex: "#FFD966"},
		{Key: "registration_no", Header: "VEHICLE REG. NO.", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "vehicle_type", Header: "VEHICLE TYPE", WidthMM: 28, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "route_name", Header: "ROUTE", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "start_time", Header: "START TIME", WidthMM: 22, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "end_time", Header: "END TIME", WidthMM: 22, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "active_hours", Header: "ACTIVE HOURS", WidthMM: 22, Type: "text", Align: "right", FillHex: "#FFD966"},
		{Key: "covered_percentage", Header: "COV%", WidthMM: 18, Type: "decimal2", Align: "right", FillHex: "#FFD966"},
		{Key: "distance_travelled", Header: "KM", WidthMM: 18, Type: "decimal2", Align: "right", FillHex: "#FFD966"},
		{Key: "average_speed", Header: "AVG SPEED", WidthMM: 22, Type: "decimal2", Align: "right", FillHex: "#FFD966"},
		{Key: "trip_count", Header: "TRIPS", WidthMM: 18, Type: "int", Align: "right", FillHex: "#FFD966"},
		{Key: "movement_summary", Header: "REMARK", WidthMM: 50, Type: "text", Align: "left", FillHex: "#FFD966"},
	}
}

// RegisterRoadSweeping registers the `road_sweeping` Report_Definition
// (catalog #1). The compute closure is supplied by cmd/server/main.go and
// is expected to wrap `GetShiftBasedOpsReport` with shift pinned to
// `night_sweep`; the rows are then partitioned by operating firm in the
// presentation layer (per docs/master-reports-catalog.md § 1).
func RegisterRoadSweeping(catalog *Catalog, compute ExistingComputeFunc, version ExistingInputVersionFunc) {
	cols := roadSweepingColumns()
	def := &ReportDefinition{
		ID:            ReportID("road_sweeping"),
		Name:          "Road Sweeping Machines",
		Category:      CategoryRoadSweeping,
		ScheduledTime: 7 * time.Hour,
		DisplayOrder:  100,
		Description:   "Night-shift road-sweeping vehicle audit grouped by operating firm (Dulevo / Ensol / Tractor Mounted). One row per vehicle.",
		Filters: []FilterControl{
			{Key: FilterDate, Required: true},
			{Key: FilterFirm, Required: false},
		},
		PermissionKey: "reports.road_sweeping.view",
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
						"distance_travelled": "sum",
						"trip_count":         "sum",
					},
					FillHex: "#BDD7EE",
				},
			},
			RemarksColumn: &ColumnRef{Key: "movement_summary"},
			TotalWidthMM:  totalWidthMM(cols),
		},
	}
	catalog.MustRegister(def)
}
