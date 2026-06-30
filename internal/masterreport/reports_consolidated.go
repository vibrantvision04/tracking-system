package masterreport

// reports_consolidated.go registers the single legacy consolidated entry —
// `daily_master_consolidated` (catalog #27).
func RegisterDailyMasterConsolidated(catalog *Catalog, compute ExistingComputeFunc, version ExistingInputVersionFunc) {
	cols := []ColumnSpec{
		{Key: "sr_no", Header: "SR NO.", WidthMM: 14, Type: "int", Align: "center", FillHex: "#FFD966"},
		{Key: "ward", Header: "Ward", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "report_name", Header: "REPORT", WidthMM: 60, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "status", Header: "STATUS", WidthMM: 28, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "reason", Header: "REASON", WidthMM: 40, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "section", Header: "SECTION", WidthMM: 20, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "firm", Header: "FIRM", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "remarks", Header: "REMARKS", WidthMM: 50, Type: "text", Align: "left", FillHex: "#FFD966"},
	}
	def := &ReportDefinition{
		ID:            ReportID("daily_master_consolidated"),
		Name:          "Daily Master Consolidated Report",
		Category:      CategoryConsolidated,
		ScheduledTime: 0,
		DisplayOrder:  999,
		Description:   "End-of-day multi-section rollup across the day's component reports.",
		Filters: []FilterControl{
			{Key: FilterDate, Required: true},
			{Key: FilterZone, Required: false},
			{Key: FilterWard, Required: false},
			{Key: FilterFirm, Required: false},
		},
		PermissionKey: "reports.daily_master_consolidated.view",
		DataSource:    NewExistingHandlerAdapter(compute, version),
		Preview: PreviewLayout{
			Columns: cols,
			RemarksColumn: &ColumnRef{Key: "remarks"},
			TotalWidthMM: totalWidthMM(cols),
		},
	}
	catalog.MustRegister(def)
}
