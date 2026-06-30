package masterreport

import "time"

// -----------------------------------------------------------------------------
// active_hoppers_summary (#10)
// -----------------------------------------------------------------------------

func RegisterActiveHoppersSummary(catalog *Catalog, compute ExistingComputeFunc, version ExistingInputVersionFunc) {
	// Keys match ActiveVehicleSummaryRow JSON tags from GetActiveVehicleSummaryReport handler.
	cols := []ColumnSpec{
		{Key: "zone_name", Header: "ZONE", WidthMM: 32, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "total_vehicles", Header: "TOTAL VEHICLES", WidthMM: 36, Type: "int", Align: "right", FillHex: "#FFD966"},
		{Key: "active_vehicles", Header: "ACTIVE", WidthMM: 24, Type: "int", Align: "right", FillHex: "#C6E0B4"},
		{Key: "inactive_vehicles", Header: "INACTIVE", WidthMM: 24, Type: "int", Align: "right", FillHex: "#F4B6B6"},
	}
	def := &ReportDefinition{
		ID:            ReportID("active_hoppers_summary"),
		Name:          "Active Hoppers Summary (1st Shift)",
		Category:      CategoryActiveVehicle,
		ScheduledTime: 12*time.Hour,
		DisplayOrder:  190,
		Description:   "Per-zone count of D2D hoppers and sweeping hoppers active in the last N minutes, snapshot at end of 1st shift.",
		Filters: []FilterControl{
			{Key: FilterDate, Required: true},
			{Key: FilterZone, Required: false},
			{Key: FilterFirm, Required: false},
		},
		PermissionKey: "reports.active_hoppers_summary.view",
		DataSource:    NewExistingHandlerAdapter(compute, version),
		Preview: PreviewLayout{
			Columns: cols,
			TotalsRows: []TotalsRow{
				{
					Position: -1,
					Label:    "GRAND TOTAL",
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
// early_departure_d2d (#11)
// -----------------------------------------------------------------------------

func RegisterEarlyDepartureD2D(catalog *Catalog, compute ExistingComputeFunc, version ExistingInputVersionFunc) {
	// Keys match EarlyDepartureRow JSON tags from GetEarlyDepartureReport handler.
	cols := []ColumnSpec{
		{Key: "registration_no", Header: "VEHICLE REG. NO.", WidthMM: 35, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "zone", Header: "ZONE", WidthMM: 32, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "ward", Header: "WARD", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "status", Header: "STATUS", WidthMM: 30, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "last_meaningful_ign_off", Header: "LAST IGN OFF", WidthMM: 32, Type: "text", Align: "center", FillHex: "#FFD966"},
		{Key: "remarks", Header: "REMARKS", WidthMM: 50, Type: "text", Align: "left", FillHex: "#FFD966"},
	}
	def := &ReportDefinition{
		ID:            ReportID("early_departure_d2d"),
		Name:          "Early Departed D2D Hoppers Summary",
		Category:      CategoryActiveVehicle,
		ScheduledTime: 15*time.Hour,
		DisplayOrder:  200,
		Description:   "Per-zone × firm count of D2D hoppers whose last GPS ping fell before the 12:01 PM cutoff.",
		Filters: []FilterControl{
			{Key: FilterDate, Required: true},
			{Key: FilterZone, Required: false},
			{Key: FilterFirm, Required: false},
		},
		PermissionKey: "reports.early_departure_d2d.view",
		DataSource:    NewExistingHandlerAdapter(compute, version),
		Preview: PreviewLayout{
			Columns: cols,
			ColorRules: []ColorRule{
				{ColumnKey: "status", Operator: "eq", Value: "Early Departed", FillHex: "#F4B6B6"},
				{ColumnKey: "status", Operator: "eq", Value: "Normal", FillHex: "#C6EFCE"},
			},
			RemarksColumn: &ColumnRef{Key: "remarks"},
			TotalWidthMM:  totalWidthMM(cols),
		},
	}
	catalog.MustRegister(def)
}
