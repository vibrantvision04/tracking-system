// Package masterreport contains the Master Consolidated Reporting Module.
//
// This file defines the core type system shared across the package:
//   - ReportID, Category, FilterKey  — closed-set identifiers
//   - FilterControl, ColumnSpec, MergeRange, ColorRule, TotalsRow, ColumnRef,
//     PreviewLayout                  — the descriptors that drive the in-page
//     preview, the Excel exporter, and the PDF exporter (Req 3.1, 4.2, 5.1).
//   - ReportDefinition               — one entry per registered report
//     (Req 1.1, 1.5).
//   - FilterPayload, Payload         — the request and response value types
//     flowing through SmartLoader / ForceRecalculator / DataSource.
//
// The DataSource interface itself lives in datasource.go (task 7.1) so the
// Compute / InputVersion contract sits next to its adapter implementations.
//
// Requirements covered: 1.5, 2.1, 2.2.
package masterreport

import (
	"encoding/json"
	"fmt"
	"regexp"
	"time"
)

// -----------------------------------------------------------------------------
// ReportID
// -----------------------------------------------------------------------------

// MaxReportIDLength is the upper bound on a ReportID in characters (Req 1.5).
const MaxReportIDLength = 64

// reportIDPattern is the closed regex that every ReportID must match (Req 1.5).
// Lowercase ASCII letters, digits, and underscores only; no leading/trailing
// constraint beyond non-emptiness — that is enforced by the length check.
var reportIDPattern = regexp.MustCompile(`^[a-z0-9_]+$`)

// ReportID is the immutable identifier of a Report_Definition. It is used as
// the primary key in report_output_cache and embedded in every permission
// row (reports.<id>.{view,export,generate}). Stability across releases is a
// contract — renaming a ReportID is a breaking change.
type ReportID string

// Validate reports whether the ReportID conforms to Req 1.5: non-empty,
// matches ^[a-z0-9_]+$, and ≤ MaxReportIDLength characters.
func (id ReportID) Validate() error {
	if len(id) == 0 {
		return fmt.Errorf("master report: report_id must not be empty")
	}
	if len(id) > MaxReportIDLength {
		return fmt.Errorf("master report: report_id %q exceeds %d characters", string(id), MaxReportIDLength)
	}
	if !reportIDPattern.MatchString(string(id)) {
		return fmt.Errorf("master report: report_id %q must match %s", string(id), reportIDPattern.String())
	}
	return nil
}

// String returns the underlying string representation (implements fmt.Stringer).
func (id ReportID) String() string { return string(id) }

// -----------------------------------------------------------------------------
// Category
// -----------------------------------------------------------------------------

// Category groups reports for display in the catalog selector. The enumeration
// is closed at compile time (Req 1.5, design §3.1).
type Category string

const (
	CategoryRoadSweeping  Category = "road_sweeping"
	CategoryOpenDepot     Category = "open_depot"
	CategoryAttendance    Category = "attendance"
	CategoryZoneCoverage  Category = "zone_coverage"
	CategoryRFID          Category = "rfid"
	CategoryWeighbridge   Category = "weighbridge"
	CategoryDeployment    Category = "deployment"
	CategoryActiveVehicle Category = "active_vehicle"
	CategoryAlerts        Category = "alerts"
	CategoryConsolidated  Category = "consolidated"
)

// AllCategories returns every Category constant in declaration order. Useful
// for catalog validators and frontend dropdowns. The returned slice is a copy;
// callers may mutate it freely.
func AllCategories() []Category {
	return []Category{
		CategoryRoadSweeping,
		CategoryOpenDepot,
		CategoryAttendance,
		CategoryZoneCoverage,
		CategoryRFID,
		CategoryWeighbridge,
		CategoryDeployment,
		CategoryActiveVehicle,
		CategoryAlerts,
		CategoryConsolidated,
	}
}

// IsValid reports whether c is one of the declared Category constants.
func (c Category) IsValid() bool {
	for _, known := range AllCategories() {
		if c == known {
			return true
		}
	}
	return false
}

// -----------------------------------------------------------------------------
// FilterKey
// -----------------------------------------------------------------------------

// FilterKey is the closed set of filter control keys a Report_Definition may
// declare in its Filter_Schema (Req 2.1).
type FilterKey string

const (
	FilterDate            FilterKey = "date"
	FilterDateRange       FilterKey = "date_range"
	FilterZone            FilterKey = "zone"
	FilterWard            FilterKey = "ward"
	FilterShift           FilterKey = "shift"
	FilterVehicle         FilterKey = "vehicle"
	FilterRoute           FilterKey = "route"
	FilterRouteType       FilterKey = "route_type"
	FilterDepartment      FilterKey = "department"
	FilterDesignation     FilterKey = "designation"
	FilterEmployee        FilterKey = "employee"
	FilterFirm            FilterKey = "firm"
	FilterTransferStation FilterKey = "transfer_station"
	FilterDumpsite        FilterKey = "dumpsite"
)

// AllFilterKeys returns every FilterKey constant in declaration order.
// FilterValidator and FilterHash callers use it for membership checks
// without round-tripping through a map literal at every call site.
func AllFilterKeys() []FilterKey {
	return []FilterKey{
		FilterDate,
		FilterDateRange,
		FilterZone,
		FilterWard,
		FilterShift,
		FilterVehicle,
		FilterRoute,
		FilterRouteType,
		FilterDepartment,
		FilterDesignation,
		FilterEmployee,
		FilterFirm,
		FilterTransferStation,
		FilterDumpsite,
	}
}

// IsValid reports whether k is one of the declared FilterKey constants.
func (k FilterKey) IsValid() bool {
	for _, known := range AllFilterKeys() {
		if k == known {
			return true
		}
	}
	return false
}

// -----------------------------------------------------------------------------
// FilterControl
// -----------------------------------------------------------------------------

// FilterControl is one entry in a Report_Definition's Filter_Schema. Each
// FilterControl is exactly one of required or optional (Req 2.2); the
// boolean Required field captures that closed dichotomy.
type FilterControl struct {
	Key      FilterKey `json:"key"`
	Required bool      `json:"required"`

	// DefaultJSON is the canonical JSON-encoded default value for the
	// control, surfaced to the frontend so the Shared_Filter_Bar can
	// pre-populate the form. Omitted (nil) when the control has no default.
	DefaultJSON json.RawMessage `json:"default,omitempty"`
}

// -----------------------------------------------------------------------------
// PreviewLayout descriptor types
// -----------------------------------------------------------------------------

// ColumnSpec describes a single column in the PreviewLayout. Used by the
// preview renderer, the Excel exporter (column header fill, width, format),
// and the PDF exporter (column width in mm contributes to A4 vs A3 sizing).
type ColumnSpec struct {
	Key     string  `json:"key"`
	Header  string  `json:"header"`
	WidthMM float64 `json:"width_mm"`

	// Type is the rendering / formatting category:
	// "int" | "decimal2" | "date_ymd" | "time_hm" | "text".
	// The string set is closed; downstream code switches on it.
	Type string `json:"type"`

	// Align is "left" | "center" | "right". Empty defaults to "left".
	Align string `json:"align"`

	// FillHex is the background color of the column header cell (e.g. "#FFD966").
	// Empty means no fill. Property 5 requires the Excel/PDF exporters to
	// reproduce this exactly.
	FillHex string `json:"fill_hex,omitempty"`
}

// MergeRange describes one rectangular block of merged cells in the report
// layout. Coordinates are zero-based with the row index counted from the
// first header row (row 0 is the topmost merged title row).
//
// Both the excelize and maroto backends consume this same descriptor;
// excelize translates (start_row, start_col, end_row, end_col) to its A1
// notation internally, while maroto draws a grid cell that spans the same
// rectangle.
type MergeRange struct {
	StartRow int `json:"start_row"`
	StartCol int `json:"start_col"`
	EndRow   int `json:"end_row"`
	EndCol   int `json:"end_col"`

	// Text is the value written into the merged region's top-left cell.
	// Empty Text means "leave whatever the data row places there".
	Text string `json:"text,omitempty"`
}

// ColorRule expresses a conditional background fill applied to data cells
// (column-header fills are owned by ColumnSpec.FillHex, not by ColorRule).
// Each rule names the column it inspects, the comparison operator, and the
// value to compare against; matching cells receive FillHex.
type ColorRule struct {
	ColumnKey string `json:"column_key"`

	// Operator is one of "eq" | "ne" | "lt" | "le" | "gt" | "ge" | "in".
	// Closed set; downstream code switches on it.
	Operator string `json:"operator"`

	// Value is the comparison RHS. For "in" it is a []any of candidates.
	// For numeric operators it must be a float64 or int.
	Value any `json:"value"`

	FillHex string `json:"fill_hex"`
}

// TotalsRow describes a totals row appended to the data body of the report.
// The Position field is the zero-based offset from the first data row; -1
// means "append after the last data row" (the common "Grand Total" case).
// Values is keyed by ColumnSpec.Key and may contain either a literal value
// or a formula expression (engine-specific) — the In_Page_Preview displays
// the literal value, and the Excel exporter is free to translate to an
// =SUM(...) formula when the value is the marker string "sum".
type TotalsRow struct {
	Position int            `json:"position"`
	Label    string         `json:"label"`
	Values   map[string]any `json:"values,omitempty"`
	FillHex  string         `json:"fill_hex,omitempty"`
}

// ColumnRef is a thin reference to a column by its Key. Used so PreviewLayout
// can name a remarks column without duplicating its full ColumnSpec.
type ColumnRef struct {
	Key string `json:"key"`
}

// PreviewLayout is the full visual descriptor for a report. The same struct
// drives:
//   - The In_Page_Preview HTML rendering (Req 3.1, 3.2).
//   - The Excel_Exporter merge ranges, header fills, totals rows, remarks
//     column (Req 4.2; Property 5).
//   - The PDF_Exporter grid layout and the A4-vs-A3 selection via
//     TotalWidthMM (Req 5.4, 5.7).
type PreviewLayout struct {
	Columns       []ColumnSpec `json:"columns"`
	MergeRanges   []MergeRange `json:"merge_ranges,omitempty"`
	ColorRules    []ColorRule  `json:"color_rules,omitempty"`
	TotalsRows    []TotalsRow  `json:"totals_rows,omitempty"`
	RemarksColumn *ColumnRef   `json:"remarks_column,omitempty"`

	// TotalWidthMM is the sum of every visible column's WidthMM. The PDF
	// exporter switches to A3 landscape when this exceeds 297 and rejects
	// the request when it exceeds 420 (Req 5.4, 5.7).
	TotalWidthMM float64 `json:"total_width_mm"`
}

// -----------------------------------------------------------------------------
// ReportDefinition
// -----------------------------------------------------------------------------

// DefaultOperationalCutoff is the canonical cutoff applied when a
// ReportDefinition does not override it (design §3.1, Req 12.3). Four hours
// after midnight is the boundary at which the "previous day's" night shift
// is considered closed and the new operational day begins.
const DefaultOperationalCutoff = 4 * time.Hour

// ReportDefinition is the single source of truth for one registered report.
// The Catalog holds a *ReportDefinition per ReportID and validates every
// field at boot (task 3.3).
type ReportDefinition struct {
	ID            ReportID
	Name          string // 1–120 chars, Req 1.5
	Category      Category
	Filters       []FilterControl
	PermissionKey string // reports.<id>.view, ≤64 chars (Req 1.5, 8.1)
	DataSource    DataSource

	// ScheduledTime is the canonical 24-hour time at which operations
	// historically pull this report, expressed as a time-of-day offset
	// from midnight (e.g. 7*time.Hour + 30*time.Minute is 07:30 AM).
	// Metadata only — not used by any runtime path — but surfaced in
	// the catalog JSON so the frontend can sort the selector by
	// schedule order (docs/master-reports-catalog.md "Conventions").
	// The zero value means "no schedule".
	ScheduledTime time.Duration

	// DisplayOrder drives the frontend selector's sort. Sparse integers
	// (100, 110, 120, ...) so new reports can be inserted between
	// existing entries without renumbering downstream rows.
	DisplayOrder int

	// Description is the 1–2 sentence summary surfaced in the catalog
	// JSON next to the display name. Source of truth is the per-report
	// section of docs/master-reports-catalog.md; the field is metadata
	// only and does not influence cache keys or audit emission.
	Description string

	Preview PreviewLayout

	// OperationalCutoff is the per-report cutoff for operational-date
	// resolution. Zero means use DefaultOperationalCutoff (Req 12.3).
	OperationalCutoff time.Duration
}

// EffectiveOperationalCutoff returns OperationalCutoff if non-zero, else
// DefaultOperationalCutoff. Callers should prefer this helper over reading
// the raw field so the default stays in one place.
func (d *ReportDefinition) EffectiveOperationalCutoff() time.Duration {
	if d.OperationalCutoff <= 0 {
		return DefaultOperationalCutoff
	}
	return d.OperationalCutoff
}

// ScheduledTimeHHMM renders ScheduledTime as a "HH:MM" 24-hour clock
// string for display in the catalog JSON. Returns "" when no schedule
// is set (the zero Duration). Durations outside the [0, 24h) range are
// reduced modulo 24h so a stray overflow does not produce a nonsense
// label like "25:00".
func (d *ReportDefinition) ScheduledTimeHHMM() string {
	if d.ScheduledTime <= 0 {
		return ""
	}
	const day = 24 * time.Hour
	mins := int(d.ScheduledTime/time.Minute) % int(day/time.Minute)
	return fmt.Sprintf("%02d:%02d", mins/60, mins%60)
}

// -----------------------------------------------------------------------------
// FilterPayload and Payload
// -----------------------------------------------------------------------------

// FilterPayload is the request-side filter set keyed by FilterKey. Permitted
// value types per design §3.3:
//   - string                        (zone, ward, shift, route, route_type,
//                                    department, designation, employee single-id)
//   - int                           (single numeric id)
//   - []int                         (multi-select numeric ids)
//   - time.Time                     (single date)
//   - [2]time.Time                  (date range: start, end inclusive)
//
// The FilterValidator (task 4.1) enforces this shape; FilterHash (task 4.2)
// canonicalises each variant before hashing.
type FilterPayload map[FilterKey]any

// Payload is the computed report body returned by DataSource.Compute and
// persisted to report_output_cache.payload as JSONB.
//
// - Rows holds the data rows in display order. Each row is a string-keyed
//   map matching the report's ColumnSpec.Key set.
// - Totals holds the precomputed totals values keyed by ColumnSpec.Key.
//   The TotalsRow descriptor in PreviewLayout names the labels and
//   positions; the values themselves live here.
// - Header holds the report-level header fields surfaced above the table
//   (resolved date label, applied filter summary, etc.).
// - GeneratedAt is the UTC timestamp at which the payload was produced.
// - InputVersion is the monotonically increasing version of the underlying
//   input data at compute time; SmartLoader uses it for staleness checks
//   (Req 12.2).
type Payload struct {
	Rows         []map[string]any `json:"rows"`
	Totals       map[string]any   `json:"totals,omitempty"`
	Header       map[string]any   `json:"header,omitempty"`
	GeneratedAt  time.Time        `json:"generated_at"`
	InputVersion int64            `json:"input_version"`
}
