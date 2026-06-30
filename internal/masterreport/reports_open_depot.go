// Package masterreport contains the Master Consolidated Reporting Module.
//
// reports_open_depot.go registers the three Open Depot (GVP) reports
// (catalog #2, #9, #12). Each shift variant shares the same column shape,
// filter set, and totals row; only the report id, display name,
// scheduled time, display order, and the closure-supplied shift pinning
// differ. See docs/master-reports-catalog.md §§ 2, 9, 12.
//
// The compute / version closures are constructed in cmd/server/main.go
// so the package never imports internal/api.
package masterreport

import "time"

// openDepotColumns returns the column descriptors shared by the three
// open-depot shift variants. Keys match the ZoneStat struct JSON tags
// from GetOpenDepotDashboard → GetLiveShiftDashboard → zone_coverages.
func openDepotColumns() []ColumnSpec {
	return []ColumnSpec{
		{Key: "zone_id", Header: "Zone ID", WidthMM: 20, Type: "int", Align: "center", FillHex: "#FFD966"},
		{Key: "zone_name", Header: "ZONE", WidthMM: 32, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "total_depots", Header: "TOTAL GVP", WidthMM: 26, Type: "int", Align: "right", FillHex: "#FFD966"},
		{Key: "resolved_depots", Header: "TOTAL LIFTED", WidthMM: 28, Type: "int", Align: "right", FillHex: "#FFD966"},
		{Key: "not_covered", Header: "NOT COVERED", WidthMM: 28, Type: "int", Align: "right", FillHex: "#F4B6B6"},
		{Key: "pending", Header: "PENDING", WidthMM: 24, Type: "int", Align: "right", FillHex: "#FFD966"},
		{Key: "coverage_percentage", Header: "CLEANING %", WidthMM: 26, Type: "decimal2", Align: "right", FillHex: "#C6E0B4"},
	}
}

// openDepotTotalsRow is the standard column-sum totals row used by every
// shift variant. Coverage % is a weighted average over total_depots.
func openDepotTotalsRow() []TotalsRow {
	return []TotalsRow{
		{
			Position: -1,
			Label:    "GRAND TOTAL",
			Values: map[string]any{
				"total_depots":        "sum",
				"resolved_depots":     "sum",
				"not_covered":         "sum",
				"pending":             "sum",
				"coverage_percentage": "weighted_avg",
			},
			FillHex: "#BDD7EE",
		},
	}
}

// registerOpenDepotShift is the shared registration helper for the three
// open-depot shift variants.
func registerOpenDepotShift(
	catalog *Catalog,
	id ReportID,
	displayName string,
	scheduledTime time.Duration,
	description string,
	displayOrder int,
	compute ExistingComputeFunc,
	version ExistingInputVersionFunc,
) {
	cols := openDepotColumns()
	def := &ReportDefinition{
		ID:            id,
		Name:          displayName,
		Category:      CategoryOpenDepot,
		ScheduledTime: scheduledTime,
		DisplayOrder:  displayOrder,
		Description:   description,
		Filters: []FilterControl{
			{Key: FilterDate, Required: true},
			{Key: FilterZone, Required: false},
			{Key: FilterFirm, Required: false},
		},
		PermissionKey: "reports." + string(id) + ".view",
		DataSource:    NewExistingHandlerAdapter(compute, version),
		Preview: PreviewLayout{
			Columns:      cols,
			TotalsRows:   openDepotTotalsRow(),
			TotalWidthMM: totalWidthMM(cols),
		},
	}
	catalog.MustRegister(def)
}

// RegisterOpenDepotGVPShift3 registers the 3rd-shift (overnight) variant
// (catalog #2, 07:30 AM). The compute closure must pin `shift_no=3`
// against the underlying GetOpenDepotDashboard repository call.
func RegisterOpenDepotGVPShift3(catalog *Catalog, compute ExistingComputeFunc, version ExistingInputVersionFunc) {
	registerOpenDepotShift(
		catalog,
		"open_depot_gvp_shift_3",
		"Open Depot GVP — 3rd Shift",
		7*time.Hour+30*time.Minute,
		"Open Depot (GVP) coverage for the night shift that closed at 06:00 AM. Per zone: total GVPs, lifted, not covered, pending, cleaning %.",
		110,
		compute, version,
	)
}

// RegisterOpenDepotGVPShift1 registers the 1st-shift (morning) variant
// (catalog #9, 11:30 AM). The compute closure must pin `shift_no=1`.
func RegisterOpenDepotGVPShift1(catalog *Catalog, compute ExistingComputeFunc, version ExistingInputVersionFunc) {
	registerOpenDepotShift(
		catalog,
		"open_depot_gvp_shift_1",
		"Open Depot GVP — 1st Shift",
		11*time.Hour+30*time.Minute,
		"Open Depot (GVP) coverage for the morning (1st) shift. Per zone: total GVPs, lifted, not covered, pending, cleaning %.",
		180,
		compute, version,
	)
}

// RegisterOpenDepotGVPShift2 registers the 2nd-shift (afternoon) variant
// (catalog #12, 04:00 PM). The compute closure must pin `shift_no=2`.
func RegisterOpenDepotGVPShift2(catalog *Catalog, compute ExistingComputeFunc, version ExistingInputVersionFunc) {
	registerOpenDepotShift(
		catalog,
		"open_depot_gvp_shift_2",
		"Open Depot GVP — 2nd Shift",
		16*time.Hour,
		"Open Depot (GVP) coverage for the afternoon (2nd) shift. Per zone: total GVPs, lifted, not covered, pending, cleaning %.",
		210,
		compute, version,
	)
}
