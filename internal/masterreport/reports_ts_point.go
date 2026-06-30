package masterreport

import "time"

// -----------------------------------------------------------------------------
// ts_point_reached_0730 (#3)
// -----------------------------------------------------------------------------

func RegisterTSPointReached0730(catalog *Catalog, compute ExistingComputeFunc, version ExistingInputVersionFunc) {
	// Keys match CoverageReportRow JSON tags from GetD2DRouteCoverageReport handler.
	cols := []ColumnSpec{
		{Key: "vehicle_reg_no", Header: "VEHICLE REG. NO.", WidthMM: 35, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "zone_name", Header: "ZONE", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "ward_name", Header: "Ward", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "route_name", Header: "ROUTE", WidthMM: 35, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "covered_percentage", Header: "COVERED %", WidthMM: 24, Type: "decimal2", Align: "right", FillHex: "#C6E0B4"},
		{Key: "in_order_percentage", Header: "In-Order %", WidthMM: 24, Type: "decimal2", Align: "right", FillHex: "#FFD966"},
		{Key: "total_checkpoints", Header: "Total Checkpoints", WidthMM: 30, Type: "int", Align: "right", FillHex: "#FFD966"},
	}
	def := &ReportDefinition{
		ID:            ReportID("ts_point_reached_0730"),
		Name:          "D2D Reached at 07:30 Check",
		Category:      CategoryZoneCoverage,
		ScheduledTime: 7*time.Hour + 45*time.Minute,
		DisplayOrder:  120,
		Description:   "Per-zone check whether each ward's D2D vehicle reached its assigned route by 07:30 AM.",
		Filters: []FilterControl{
			{Key: FilterDate, Required: true},
			{Key: FilterZone, Required: false},
		},
		PermissionKey: "reports.ts_point_reached_0730.view",
		DataSource:    NewExistingHandlerAdapter(compute, version),
		Preview: PreviewLayout{
			Columns: cols,
			ColorRules: []ColorRule{
				{ColumnKey: "covered_percentage", Operator: "lt", Value: float64(50), FillHex: "#F4B6B6"},
				{ColumnKey: "covered_percentage", Operator: "ge", Value: float64(80), FillHex: "#C6EFCE"},
			},
			TotalsRows: []TotalsRow{
				{
					Position: -1,
					Label:    "TOTAL",
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
// ts_point_reached (#6)
// -----------------------------------------------------------------------------

// RegisterTSPointReached registers the 09:00 AM TS-point reach check
// (catalog #6). Rows are partitioned by vehicle type
// (Refuse Compactor / Hook Loader / Dumper) at presentation time.
func RegisterTSPointReached(catalog *Catalog, compute ExistingComputeFunc, version ExistingInputVersionFunc) {
	// Keys match GTSTripReportRow JSON tags from GetGTSTripReport handler.
	cols := []ColumnSpec{
		{Key: "vehicle_id", Header: "Vehicle ID", WidthMM: 20, Type: "int", Align: "center", FillHex: "#FFD966"},
		{Key: "registration_no", Header: "VEHICLE REG. NO.", WidthMM: 35, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "zone_name", Header: "ZONE", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "ward_name", Header: "WARD", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "trip_count", Header: "TRIPS", WidthMM: 18, Type: "int", Align: "center", FillHex: "#FFD966"},
		{Key: "rejected_count", Header: "REJECTED", WidthMM: 20, Type: "int", Align: "center", FillHex: "#F4B6B6"},
		{Key: "rejection_reasons", Header: "REMARK", WidthMM: 50, Type: "text", Align: "left", FillHex: "#FFD966"},
	}
	def := &ReportDefinition{
		ID:            ReportID("ts_point_reached"),
		Name:          "TS Point Reached Check",
		Category:      CategoryWeighbridge,
		ScheduledTime: 9 * time.Hour,
		DisplayOrder:  150,
		Description:   "Per-zone check whether each waste-collection vehicle has reached its assigned transfer station / dumpsite by 09:00 AM.",
		Filters: []FilterControl{
			{Key: FilterDate, Required: true},
			{Key: FilterZone, Required: false},
			{Key: FilterRouteType, Required: false},
		},
		PermissionKey: "reports.ts_point_reached.view",
		DataSource:    NewExistingHandlerAdapter(compute, version),
		Preview: PreviewLayout{
			Columns: cols,
			TotalsRows: []TotalsRow{
				{
					Position: -1,
					Label:    "TOTAL",
					Values: map[string]any{
						"trip_count":     "sum",
						"rejected_count": "sum",
					},
					FillHex: "#BDD7EE",
				},
			},
			RemarksColumn: &ColumnRef{Key: "rejection_reasons"},
			TotalWidthMM:  totalWidthMM(cols),
		},
	}
	catalog.MustRegister(def)
}
