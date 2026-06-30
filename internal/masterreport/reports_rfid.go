//
// reports_rfid.go registers the single RFID-collection report —
// `rfid_collection` (catalog #23, 07:30 PM). New aggregation — Phase D
// will supply the SQL via the compute closure (rfid_scan_log ⋈
// households ⋈ payments).
//
// See docs/master-reports-catalog.md § 23 for the canonical spec.
package masterreport

import "time"

// RegisterRFIDCollection registers the per-zone × firm RFID-tag scan
// count and revenue collected report (catalog #23, 07:30 PM).
func RegisterRFIDCollection(catalog *Catalog, compute ExistingComputeFunc, version ExistingInputVersionFunc) {
	cols := []ColumnSpec{
		{Key: "sr_no", Header: "SR NO.", WidthMM: 14, Type: "int", Align: "center", FillHex: "#FFD966"},
		{Key: "zone", Header: "ZONE", WidthMM: 30, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "firm", Header: "FIRM", WidthMM: 32, Type: "text", Align: "left", FillHex: "#FFD966"},
		{Key: "total_household_commercial", Header: "TOTAL HOUSEHOLD/COMMERCIAL", WidthMM: 50, Type: "int", Align: "right", FillHex: "#FFD966"},
		{Key: "collected_today", Header: "COLLECTED H/C (TODAY)", WidthMM: 38, Type: "int", Align: "right", FillHex: "#C6E0B4"},
		{Key: "collection_rs", Header: "COLLECTION IN Rs", WidthMM: 32, Type: "decimal2", Align: "right", FillHex: "#C6E0B4"},
	}
	def := &ReportDefinition{
		ID:            ReportID("rfid_collection"),
		Name:          "RFID Collection",
		Category:      CategoryRFID,
		ScheduledTime: 19*time.Hour + 30*time.Minute,
		DisplayOrder:  320,
		Description:   "Per-zone × firm RFID-tag scan count, today's household/commercial collection count, and revenue in Rs.",
		Filters: []FilterControl{
			{Key: FilterDate, Required: true},
			{Key: FilterZone, Required: false},
			{Key: FilterFirm, Required: false},
		},
		PermissionKey: "reports.rfid_collection.view",
		DataSource:    NewExistingHandlerAdapter(compute, version),
		Preview: PreviewLayout{
			Columns: cols,
			TotalsRows: []TotalsRow{
				{
					Position: -1,
					Label:    "AVERAGE/TOTAL",
					Values: map[string]any{
						"total_household_commercial": "sum",
						"collected_today":            "sum",
						"collection_rs":              "sum",
					},
					FillHex: "#BDD7EE",
				},
			},
			TotalWidthMM: totalWidthMM(cols),
		},
	}
	catalog.MustRegister(def)
}
