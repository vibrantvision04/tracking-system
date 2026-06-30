package masterreport

import "time"

// reports_gts_weighbridge.go registers two GTS / weighbridge reports:
//
//	gts_trip              (#21, 18:30) — wraps GetGTSTripReport
//	weight_bridge_report  (#22, 19:00) — new aggregation over weighbridge_data
//
// See docs/master-reports-catalog.md §§ 21, 22. The `dumpsite` filter on
// weight_bridge_report is semantically equivalent to the existing
// `transfer_station` FilterKey per the resolution in the catalog's
// "Architecture changes" section. Compute closures live in
// cmd/server/main.go.

// -----------------------------------------------------------------------------
// gts_trip (#21)
// -----------------------------------------------------------------------------

// RegisterGTSTrip registers the per-vehicle GTS trip detail (catalog #21,
// 06:30 PM). Rows are partitioned by vehicle type (Refuse Compactor /
// Hook Loader / Dumper) at presentation time.
func RegisterGTSTrip(catalog *Catalog, compute ExistingComputeFunc, version ExistingInputVersionFunc) {
	// Keys match GTSTripReportRow JSON tags from GetGTSTripReport handler.
	cols := []ColumnSpec{
		{Key: "registration_no", Header: "VEHICLE REG. NO.", WidthMM: 32, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "zone_name", Header: "ZONE", WidthMM: 28, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "ward_name", Header: "WARD", WidthMM: 28, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "trip_count", Header: "TRIPS AT DUMPSITE", WidthMM: 28, Type: "int", Align: "right", FillHex: "#FFD966"},
		{Key: "rejected_count", Header: "REJECTED", WidthMM: 24, Type: "int", Align: "right", FillHex: "#F4B6B6"},
		{Key: "rejection_reasons", Header: "REMARK", WidthMM: 36, Type: "text", Align: "left", FillHex: "#FFD966"},
	}
	def := &ReportDefinition{
		ID:            ReportID("gts_trip"),
		Name:          "GTS Trip Detail",
		Category:      CategoryWeighbridge,
		ScheduledTime: 18*time.Hour + 30*time.Minute,
		DisplayOrder:  300,
		Description:   "Per-vehicle GTS trip detail by vehicle type: TS point, times, active hours, KM, trips, and total waste transported.",
		Filters: []FilterControl{
			{Key: FilterDate, Required: true},
			{Key: FilterZone, Required: false},
			{Key: FilterRouteType, Required: false},
		},
		PermissionKey: "reports.gts_trip.view",
		DataSource:    NewExistingHandlerAdapter(compute, version),
		Preview: PreviewLayout{
			Columns: cols,
			TotalsRows: []TotalsRow{
				{
					Position: -1,
					Label:    "GRAND TOTAL",
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

// -----------------------------------------------------------------------------
// weight_bridge_report (#22)
// -----------------------------------------------------------------------------

// RegisterWeightBridgeReport registers the per-dumpsite × firm end-of-day
// weighbridge summary (catalog #22, 07:00 PM). New aggregation — Phase D
// will supply the SQL via the compute closure.
//
// The `dumpsite` filter from the catalog is mapped to the existing
// `transfer_station` FilterKey per the catalog's architecture-changes
// resolution: the two concepts are equivalent in this dataset and
// reusing the key keeps the closed FilterKey set tight.
func RegisterWeightBridgeReport(catalog *Catalog, compute ExistingComputeFunc, version ExistingInputVersionFunc) {
	// Keys match GTSTripReportRow JSON tags from GetGTSTripReport handler.
	cols := []ColumnSpec{
		{Key: "vehicle_id", Header: "VEHICLE ID", WidthMM: 26, Type: "int", Align: "center", FillHex: "#FFD966"},
		{Key: "registration_no", Header: "VEHICLE REG. NO.", WidthMM: 36, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "zone_name", Header: "ZONE", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "ward_name", Header: "WARD", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "trip_count", Header: "TOTAL TRIPS", WidthMM: 28, Type: "int", Align: "right", FillHex: "#FFD966"},
		{Key: "rejected_count", Header: "REJECTED", WidthMM: 28, Type: "int", Align: "right", FillHex: "#F4B6B6"},
	}
	def := &ReportDefinition{
		ID:            ReportID("weight_bridge_report"),
		Name:          "Weight Bridge Final Report",
		Category:      CategoryWeighbridge,
		ScheduledTime: 19 * time.Hour,
		DisplayOrder:  310,
		Description:   "Per-dumpsite × firm summary: total vehicles, total trips, total weight in tons for the day.",
		Filters: []FilterControl{
			{Key: FilterDate, Required: true},
			{Key: FilterTransferStation, Required: false},
			{Key: FilterFirm, Required: false},
		},
		PermissionKey: "reports.weight_bridge_report.view",
		DataSource:    NewExistingHandlerAdapter(compute, version),
		Preview: PreviewLayout{
			Columns: cols,
			TotalsRows: []TotalsRow{
				{
					Position: -1,
					Label:    "GRAND TOTAL",
					Values: map[string]any{
						"trip_count":     "sum",
						"rejected_count": "sum",
					},
					FillHex: "#BDD7EE",
				},
			},
			TotalWidthMM: totalWidthMM(cols),
		},
	}
	catalog.MustRegister(def)
}
