// Package masterreport contains the Master Consolidated Reporting Module.
//
// This file implements ExcelExporter — the .xlsx renderer that every
// `GET /api/master-reports/{report_id}/export.xlsx` request flows through.
// It is built on `github.com/xuri/excelize/v2`, the same library the legacy
// `internal/ultimatereport.ExcelEngine` already uses, so no second xlsx
// dependency is introduced (design §9.1).
//
// Single programmatic render path
// -------------------------------
//
// Every export is produced from scratch using only the report's
// `PreviewLayout`. The exporter reproduces MergeRanges, column headers
// with their FillHex, data rows formatted per ColumnSpec.Type, totals
// rows, and ColorRule fills. There is no template-file dependency at
// runtime — the original `ULTIMATE REPORTING.xlsx` workbook served as a
// one-time reverse-engineering reference for the PreviewLayout
// descriptors and is no longer consulted by the application.
//
// The rendered workbook is written to an internal bytes.Buffer first;
// HTTP response headers (Content-Type, Content-Disposition) are committed
// only after the fill+write completes successfully (Req 4.4, 4.6). A fill
// failure surfaces as a returned error and no body bytes are written to
// the http.ResponseWriter — the caller in master_report_handlers.go
// translates the error into a JSON error response without polluting the
// response with a partial workbook.
//
// Empty result handling: when payload.Rows is empty the workbook still
// emits its computed header row, merges, and column headers (Req 4.7);
// an empty payload is never an error.
//
// Requirements covered: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7.
package masterreport

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"reflect"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"
)

// -----------------------------------------------------------------------------
// MIME and filename constants
// -----------------------------------------------------------------------------

// xlsxMIMEType is the IANA-registered Content-Type for Office Open XML
// spreadsheets. Surfaced as a constant so the HTTP handler tests in
// task 15.4 can assert against the same literal.
const xlsxMIMEType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

// xlsxFilenameDateFormat is the operational-date layout embedded in the
// Content-Disposition filename (Req 4.4). Stable across timezones because
// the operational date is always normalised to UTC midnight before being
// formatted.
const xlsxFilenameDateFormat = "2006-01-02"

// -----------------------------------------------------------------------------
// ExcelExporter
// -----------------------------------------------------------------------------

// ExcelExporter renders a Payload to an .xlsx workbook and streams the
// bytes to an http.ResponseWriter. The struct holds an optional reference
// to the Catalog as a forward-looking validation hook; no per-catalog
// state is actually consulted today, so concurrent Export calls never
// contend on shared state.
type ExcelExporter struct {
	// catalog is retained for a future validation hook (e.g. rejecting
	// Export calls whose ReportID is no longer registered). It is not
	// consulted by the current render path and may be nil.
	catalog *Catalog
}

// NewExcelExporter constructs an ExcelExporter. The catalog argument is
// retained as a forward-looking validation hook and may be nil — every
// Export call renders programmatically from the supplied
// ReportDefinition.Preview descriptor regardless of catalog state.
//
// The constructor returns an error for symmetry with sibling factories
// (e.g. PDFExporter) and so a future validation step can fail boot
// without changing every call site. Today the only failure mode is the
// internal allocation, which cannot fail, so the returned error is
// always nil.
func NewExcelExporter(catalog *Catalog) (*ExcelExporter, error) {
	return &ExcelExporter{catalog: catalog}, nil
}

// Export renders payload into an .xlsx workbook for def and streams the
// bytes to w. The HTTP response headers are committed only after a
// successful in-memory render, so a fill failure produces no partial
// content on the wire (Req 4.4, 4.6).
//
// Arguments:
//
//   - ctx     — request context. Excel rendering is CPU-bound and does not
//     issue I/O internally, so ctx cancellation is not honored mid-fill;
//     the caller is expected to bound rendering via the HTTP server's
//     write timeout or a wrapping context.WithTimeout if needed.
//   - def     — the registered ReportDefinition. The exporter reads only
//     def.ID (for the filename) and def.Preview (for layout).
//   - payload — the Payload produced by SmartLoader.Load or
//     ForceRecalculator.Recalculate. The Rows slice may be empty; an
//     empty payload still produces a valid workbook (Req 4.7).
//   - opDate  — the operational date the request keyed on. Used only to
//     compose the Content-Disposition filename in YYYY-MM-DD form. The
//     date is normalised to UTC before formatting so two callers in
//     different zones produce the same filename for the same operational
//     day.
//   - w       — the destination http.ResponseWriter. Headers Content-Type
//     and Content-Disposition are set on w only after the workbook has
//     been fully serialised to an internal buffer; the body bytes are
//     then written in a single Write call.
//
// Returns nil on success. Returns a non-nil error on fill failure or
// serialization failure — in every failure case no response headers are
// committed and no body bytes are written, so the HTTP handler is free to
// render a JSON error envelope without conflict.
func (e *ExcelExporter) Export(
	ctx context.Context,
	def *ReportDefinition,
	payload Payload,
	opDate time.Time,
	w http.ResponseWriter,
) error {
	if def == nil {
		return fmt.Errorf("masterreport excel: Export called with nil ReportDefinition")
	}
	if w == nil {
		return fmt.Errorf("masterreport excel: Export called with nil http.ResponseWriter for report %q", def.ID)
	}

	// Render to an internal buffer first. Only after the buffer is
	// fully populated do we commit headers; this is the single
	// guarantee that satisfies Req 4.6 ("no partial content on
	// failure"). Allocating a buffer here is cheap relative to the
	// workbook serialisation itself.
	var buf bytes.Buffer

	// excelize.NewFile creates a new workbook with a single "Sheet1"
	// worksheet, which is what the programmatic path writes into.
	f := excelize.NewFile()
	defer func() { _ = f.Close() }()

	if fillErr := fillProgrammatic(f, payload, def.Preview); fillErr != nil {
		return fmt.Errorf("masterreport excel: programmatic fill for %q: %w", def.ID, fillErr)
	}
	if writeErr := f.Write(&buf); writeErr != nil {
		return fmt.Errorf("masterreport excel: serialize workbook for %q: %w", def.ID, writeErr)
	}

	// Honor ctx cancellation right before we touch the response writer.
	// We do not bail mid-fill because the render is CPU-bound and short
	// (single-digit seconds even for the largest reports); checking
	// here gives the caller a clean abort point that costs nothing on
	// the happy path.
	if err := ctx.Err(); err != nil {
		return fmt.Errorf("masterreport excel: context cancelled before streaming for %q: %w", def.ID, err)
	}

	// Commit headers AFTER fill+serialize succeed (Req 4.4, 4.6).
	// http.ResponseWriter requires headers to be set before the first
	// Write call; we set them here and let the subsequent w.Write
	// implicitly flush the header block.
	w.Header().Set("Content-Type", xlsxMIMEType)
	w.Header().Set(
		"Content-Disposition",
		fmt.Sprintf(`attachment; filename="%s_%s.xlsx"`, def.ID, opDate.UTC().Format(xlsxFilenameDateFormat)),
	)

	if _, writeErr := w.Write(buf.Bytes()); writeErr != nil {
		// At this point headers have been committed and the
		// response is partially flushed; the caller cannot recover
		// to a JSON error envelope. We surface the error so the
		// audit emitter records the failure with the right
		// outcome (Req 10.1, 12.5).
		return fmt.Errorf("masterreport excel: stream body for %q: %w", def.ID, writeErr)
	}
	return nil
}

// -----------------------------------------------------------------------------
// Programmatic fill path
// -----------------------------------------------------------------------------

// fillProgrammatic builds a workbook from scratch using only the
// PreviewLayout descriptor. It applies all styles: column header fills,
// totals row fills, ColorRule data-cell fills, and per-column number
// formats. The output is property-tested for structural fidelity
// (Property 5, task 17.3).
func fillProgrammatic(f *excelize.File, payload Payload, layout PreviewLayout) error {
	// excelize.NewFile creates one default sheet; SheetIndex 0 is its
	// position. Retrieve the actual sheet name (typically "Sheet1") so
	// later API calls don't depend on the default literal.
	sheet := f.GetSheetName(0)
	if sheet == "" {
		return fmt.Errorf("programmatic workbook has no default sheet")
	}

	// 1. Title merges. Each MergeRange becomes a real merged region;
	// when the layout supplies a Text it lands in the merged region's
	// top-left cell.
	for _, mr := range layout.MergeRanges {
		startCell, err := excelize.CoordinatesToCellName(mr.StartCol+1, mr.StartRow+1)
		if err != nil {
			return fmt.Errorf("merge start coordinates (%d,%d): %w", mr.StartCol+1, mr.StartRow+1, err)
		}
		endCell, err := excelize.CoordinatesToCellName(mr.EndCol+1, mr.EndRow+1)
		if err != nil {
			return fmt.Errorf("merge end coordinates (%d,%d): %w", mr.EndCol+1, mr.EndRow+1, err)
		}
		if mergeErr := f.MergeCell(sheet, startCell, endCell); mergeErr != nil {
			return fmt.Errorf("merge cells %s:%s: %w", startCell, endCell, mergeErr)
		}
		if mr.Text != "" {
			if setErr := f.SetCellValue(sheet, startCell, mr.Text); setErr != nil {
				return fmt.Errorf("write merge text at %s: %w", startCell, setErr)
			}
		}
	}

	// 2. Column header row. Positioned immediately after the deepest
	// MergeRange so title bars (when present) sit above the headers.
	headerRow := computeColumnHeaderRow(layout)
	dataStartRow := headerRow + 1

	for colIdx, spec := range layout.Columns {
		cell, err := excelize.CoordinatesToCellName(colIdx+1, headerRow)
		if err != nil {
			return fmt.Errorf("header coordinates col %d: %w", colIdx+1, err)
		}
		if setErr := f.SetCellValue(sheet, cell, spec.Header); setErr != nil {
			return fmt.Errorf("write header %s: %w", cell, setErr)
		}
		if styleErr := applyHeaderStyle(f, sheet, cell, spec); styleErr != nil {
			return styleErr
		}
		if widthErr := applyColumnWidth(f, sheet, colIdx+1, spec.WidthMM); widthErr != nil {
			return widthErr
		}
	}

	// 3. Data rows.
	for i, row := range payload.Rows {
		excelRow := dataStartRow + i
		for colIdx, spec := range layout.Columns {
			cell, err := excelize.CoordinatesToCellName(colIdx+1, excelRow)
			if err != nil {
				return fmt.Errorf("data coordinates row %d col %d: %w", excelRow, colIdx+1, err)
			}
			val, ok := row[spec.Key]
			if !ok || val == nil {
				continue
			}
			if setErr := f.SetCellValue(sheet, cell, formatValueForCell(val, spec.Type)); setErr != nil {
				return fmt.Errorf("write data cell %s: %w", cell, setErr)
			}
			if styleErr := applyDataCellStyle(f, sheet, cell, spec); styleErr != nil {
				return styleErr
			}
		}
	}

	// 4. Color rules — applied AFTER data styles so a matching rule
	// overrides the per-column alignment/format style for the fill
	// only. excelize replaces the cell style wholesale on
	// SetCellStyle, so the rule style must carry the same alignment
	// and number format the per-column style established; we merge
	// the two via applyColorRules below.
	if err := applyColorRules(f, sheet, payload, layout, dataStartRow); err != nil {
		return err
	}

	// 5. Totals rows.
	lastDataRow := dataStartRow + len(payload.Rows) - 1
	for _, totals := range layout.TotalsRows {
		var excelRow int
		if totals.Position < 0 {
			lastDataRow++
			excelRow = lastDataRow
		} else {
			excelRow = dataStartRow + totals.Position
		}
		if totals.Label != "" {
			cell, err := excelize.CoordinatesToCellName(1, excelRow)
			if err != nil {
				return fmt.Errorf("totals label coordinates row %d: %w", excelRow, err)
			}
			if setErr := f.SetCellValue(sheet, cell, totals.Label); setErr != nil {
				return fmt.Errorf("write totals label %s: %w", cell, setErr)
			}
		}
		for colIdx, spec := range layout.Columns {
			val, ok := totals.Values[spec.Key]
			if !ok || val == nil {
				continue
			}
			cell, err := excelize.CoordinatesToCellName(colIdx+1, excelRow)
			if err != nil {
				return fmt.Errorf("totals value coordinates row %d col %d: %w", excelRow, colIdx+1, err)
			}
			if setErr := f.SetCellValue(sheet, cell, formatValueForCell(val, spec.Type)); setErr != nil {
				return fmt.Errorf("write totals cell %s: %w", cell, setErr)
			}
		}
		if totals.FillHex != "" && len(layout.Columns) > 0 {
			startCell, err := excelize.CoordinatesToCellName(1, excelRow)
			if err != nil {
				return fmt.Errorf("totals fill start coordinates row %d: %w", excelRow, err)
			}
			endCell, err := excelize.CoordinatesToCellName(len(layout.Columns), excelRow)
			if err != nil {
				return fmt.Errorf("totals fill end coordinates row %d: %w", excelRow, err)
			}
			styleID, styleErr := f.NewStyle(&excelize.Style{
				Fill: excelize.Fill{
					Type:    "pattern",
					Pattern: 1,
					Color:   []string{normalizeHex(totals.FillHex)},
				},
				Font:      &excelize.Font{Bold: true},
				Alignment: &excelize.Alignment{Vertical: "center"},
			})
			if styleErr != nil {
				return fmt.Errorf("build totals row style: %w", styleErr)
			}
			if applyErr := f.SetCellStyle(sheet, startCell, endCell, styleID); applyErr != nil {
				return fmt.Errorf("apply totals row style %s:%s: %w", startCell, endCell, applyErr)
			}
		}
	}

	return nil
}

// -----------------------------------------------------------------------------
// Style helpers (programmatic path)
// -----------------------------------------------------------------------------

// applyHeaderStyle writes the column-header cell style: optional FillHex,
// bold text, and the column's declared alignment. Headers are always bold
// regardless of whether FillHex is set so the header row stays visually
// distinct from data even on unfilled columns.
func applyHeaderStyle(f *excelize.File, sheet, cell string, spec ColumnSpec) error {
	style := &excelize.Style{
		Font: &excelize.Font{Bold: true},
		Alignment: &excelize.Alignment{
			Horizontal: alignmentFromColumnSpec(spec),
			Vertical:   "center",
			WrapText:   true,
		},
	}
	if spec.FillHex != "" {
		style.Fill = excelize.Fill{
			Type:    "pattern",
			Pattern: 1,
			Color:   []string{normalizeHex(spec.FillHex)},
		}
	}
	styleID, err := f.NewStyle(style)
	if err != nil {
		return fmt.Errorf("build header style for %s: %w", cell, err)
	}
	if applyErr := f.SetCellStyle(sheet, cell, cell, styleID); applyErr != nil {
		return fmt.Errorf("apply header style at %s: %w", cell, applyErr)
	}
	return nil
}

// applyDataCellStyle writes the per-column style for a single data cell:
// alignment (from spec.Align) and number format (from spec.Type). The
// style id is constructed afresh per call so the cache excelize keeps
// internally dedupes identical styles — there is no need for an external
// cache here.
func applyDataCellStyle(f *excelize.File, sheet, cell string, spec ColumnSpec) error {
	style := dataCellStyle(spec)
	if style == nil {
		return nil
	}
	styleID, err := f.NewStyle(style)
	if err != nil {
		return fmt.Errorf("build data style for %s: %w", cell, err)
	}
	if applyErr := f.SetCellStyle(sheet, cell, cell, styleID); applyErr != nil {
		return fmt.Errorf("apply data style at %s: %w", cell, applyErr)
	}
	return nil
}

// dataCellStyle composes the alignment + number format style for a column.
// Returns nil when the resulting style would be a no-op (default
// alignment, no number format) so we avoid allocating throwaway styles.
func dataCellStyle(spec ColumnSpec) *excelize.Style {
	horizontal := alignmentFromColumnSpec(spec)
	customFmt := numberFormatForType(spec.Type)

	if horizontal == "" && customFmt == "" {
		return nil
	}
	style := &excelize.Style{}
	if horizontal != "" {
		style.Alignment = &excelize.Alignment{Horizontal: horizontal, Vertical: "center"}
	}
	if customFmt != "" {
		// CustomNumFmt is a *string so we cannot inline the literal;
		// the local variable below pins a stable address.
		fmtCopy := customFmt
		style.CustomNumFmt = &fmtCopy
	}
	return style
}

// alignmentFromColumnSpec maps ColumnSpec.Align ("left" | "center" |
// "right") to the excelize horizontal-alignment literal. An empty Align
// returns the empty string ("") so callers can decide whether to emit a
// style at all. Type-aware defaults: numeric columns ("int", "decimal2")
// right-align, date/time columns center-align, everything else left.
func alignmentFromColumnSpec(spec ColumnSpec) string {
	switch strings.ToLower(spec.Align) {
	case "left", "center", "right":
		return strings.ToLower(spec.Align)
	}
	switch spec.Type {
	case "int", "decimal2":
		return "right"
	case "date_ymd", "time_hm":
		return "center"
	}
	return "left"
}

// numberFormatForType returns the custom Excel number-format pattern for
// the supplied ColumnSpec.Type. An empty result means "no special format —
// let Excel infer from the cell value type".
func numberFormatForType(typ string) string {
	switch typ {
	case "int":
		return "0"
	case "decimal2":
		return "0.00"
	case "date_ymd":
		return "yyyy-mm-dd"
	case "time_hm":
		return "hh:mm"
	}
	return ""
}

// applyColumnWidth converts widthMM (millimetres) into excelize's
// character-width unit and applies it to a single column. The conversion
// is approximate — Excel column widths are expressed in units of the
// "0" character width of the default font, which at the standard Calibri
// 11pt comes out to roughly 2.5 mm per width unit. The factor matches the
// approximation used elsewhere in the codebase and keeps property tests
// stable across runs.
//
// A non-positive widthMM is treated as "let Excel auto-fit" and no width
// is set.
func applyColumnWidth(f *excelize.File, sheet string, colNum int, widthMM float64) error {
	if widthMM <= 0 {
		return nil
	}
	colLetter, err := excelize.ColumnNumberToName(colNum)
	if err != nil {
		return fmt.Errorf("column letter for %d: %w", colNum, err)
	}
	width := widthMM / 2.5
	if width < 1 {
		width = 1
	}
	if setErr := f.SetColWidth(sheet, colLetter, colLetter, width); setErr != nil {
		return fmt.Errorf("set width for column %s: %w", colLetter, setErr)
	}
	return nil
}

// -----------------------------------------------------------------------------
// Color-rule application (programmatic path)
// -----------------------------------------------------------------------------

// applyColorRules walks every ColorRule in layout and stamps the
// rule.FillHex onto each data cell whose value matches the rule's
// (operator, value) predicate. Rules are applied in declaration order so a
// later rule overrides an earlier one when both match the same cell —
// matching the In_Page_Preview semantics (design §3.1).
//
// Style composition note: SetCellStyle replaces the entire cell style,
// not just the fill, so the rule style here also re-establishes the
// per-column alignment and number format. Without that, applying a color
// rule would clear the right-align of a numeric column.
func applyColorRules(f *excelize.File, sheet string, payload Payload, layout PreviewLayout, dataStartRow int) error {
	if len(layout.ColorRules) == 0 {
		return nil
	}
	colByKey := make(map[string]int, len(layout.Columns))
	specByKey := make(map[string]ColumnSpec, len(layout.Columns))
	for i, spec := range layout.Columns {
		colByKey[spec.Key] = i
		specByKey[spec.Key] = spec
	}

	for _, rule := range layout.ColorRules {
		colIdx, ok := colByKey[rule.ColumnKey]
		if !ok {
			// Rule references a column not present in the
			// layout; skip silently — Catalog.Validate (task 3.3)
			// is responsible for surfacing the configuration
			// error at boot.
			continue
		}
		spec := specByKey[rule.ColumnKey]

		ruleStyle := &excelize.Style{
			Fill: excelize.Fill{
				Type:    "pattern",
				Pattern: 1,
				Color:   []string{normalizeHex(rule.FillHex)},
			},
		}
		if horizontal := alignmentFromColumnSpec(spec); horizontal != "" {
			ruleStyle.Alignment = &excelize.Alignment{Horizontal: horizontal, Vertical: "center"}
		}
		if customFmt := numberFormatForType(spec.Type); customFmt != "" {
			fmtCopy := customFmt
			ruleStyle.CustomNumFmt = &fmtCopy
		}
		styleID, err := f.NewStyle(ruleStyle)
		if err != nil {
			return fmt.Errorf("build color-rule style for %q: %w", rule.ColumnKey, err)
		}

		for i, row := range payload.Rows {
			val, present := row[rule.ColumnKey]
			if !present {
				continue
			}
			if !ruleMatches(val, rule.Operator, rule.Value) {
				continue
			}
			cell, cellErr := excelize.CoordinatesToCellName(colIdx+1, dataStartRow+i)
			if cellErr != nil {
				return fmt.Errorf("color rule coordinates row %d col %d: %w", dataStartRow+i, colIdx+1, cellErr)
			}
			if applyErr := f.SetCellStyle(sheet, cell, cell, styleID); applyErr != nil {
				return fmt.Errorf("apply color rule at %s: %w", cell, applyErr)
			}
		}
	}
	return nil
}

// ruleMatches evaluates one ColorRule predicate against one cell value.
// Operator is one of "eq" | "ne" | "lt" | "le" | "gt" | "ge" | "in".
// Numeric comparisons coerce both sides through toFloat64; if either
// side cannot be coerced the comparison returns false. Equality uses
// reflect.DeepEqual after numeric coercion attempts, so 3, 3.0, and
// "3" compare unequal — matching the In_Page_Preview's strict typing.
func ruleMatches(cellVal any, op string, ruleVal any) bool {
	switch op {
	case "eq":
		if eqViaFloat(cellVal, ruleVal) {
			return true
		}
		return reflect.DeepEqual(cellVal, ruleVal)
	case "ne":
		if eqViaFloat(cellVal, ruleVal) {
			return false
		}
		return !reflect.DeepEqual(cellVal, ruleVal)
	case "lt", "le", "gt", "ge":
		a, aOk := toFloat64(cellVal)
		b, bOk := toFloat64(ruleVal)
		if !aOk || !bOk {
			return false
		}
		switch op {
		case "lt":
			return a < b
		case "le":
			return a <= b
		case "gt":
			return a > b
		case "ge":
			return a >= b
		}
	case "in":
		list, ok := ruleVal.([]any)
		if !ok {
			return false
		}
		for _, candidate := range list {
			if eqViaFloat(cellVal, candidate) || reflect.DeepEqual(cellVal, candidate) {
				return true
			}
		}
		return false
	}
	return false
}

// eqViaFloat returns true when both arguments coerce to the same float64.
// Used so equality between int(3), float64(3), and json.Number("3") all
// return true — payloads round-tripped through JSON typically arrive as
// float64 or json.Number even when the source was an integer.
func eqViaFloat(a, b any) bool {
	af, aOk := toFloat64(a)
	bf, bOk := toFloat64(b)
	return aOk && bOk && af == bf
}

// -----------------------------------------------------------------------------
// Value coercion
// -----------------------------------------------------------------------------

// formatValueForCell coerces a payload value into the Go type that yields
// the desired Excel rendering for a given ColumnSpec.Type:
//
//   - "int"      → int64 (Excel renders as integer)
//   - "decimal2" → float64 (paired with the "0.00" number format)
//   - "date_ymd" → time.Time when possible, else string passthrough
//                  (paired with the "yyyy-mm-dd" number format)
//   - "time_hm"  → string formatted "HH:mm" when the source is time.Time
//   - "text" / default → string
//
// Values that cannot be coerced fall through to the source value so
// excelize's default handling applies — better to render a slightly off
// type than to drop data on the floor.
func formatValueForCell(v any, typ string) any {
	if v == nil {
		return nil
	}
	switch typ {
	case "int":
		if n, ok := toInt64(v); ok {
			return n
		}
		return v
	case "decimal2":
		if n, ok := toFloat64(v); ok {
			return n
		}
		return v
	case "date_ymd":
		switch d := v.(type) {
		case time.Time:
			return d
		case string:
			if t, err := time.Parse(time.RFC3339, d); err == nil {
				return t
			}
			if t, err := time.Parse("2006-01-02", d); err == nil {
				return t
			}
			return d
		}
		return v
	case "time_hm":
		switch t := v.(type) {
		case time.Time:
			return t.Format("15:04")
		case string:
			return t
		}
		return v
	case "text":
		return toString(v)
	}
	return v
}

// toInt64 attempts a numeric coercion to int64. Returns (0, false) when
// the value is not convertible without precision loss.
func toInt64(v any) (int64, bool) {
	switch n := v.(type) {
	case int:
		return int64(n), true
	case int8:
		return int64(n), true
	case int16:
		return int64(n), true
	case int32:
		return int64(n), true
	case int64:
		return n, true
	case uint:
		return int64(n), true
	case uint8:
		return int64(n), true
	case uint16:
		return int64(n), true
	case uint32:
		return int64(n), true
	case uint64:
		return int64(n), true
	case float32:
		return int64(n), true
	case float64:
		return int64(n), true
	case json.Number:
		if i, err := n.Int64(); err == nil {
			return i, true
		}
		if f, err := n.Float64(); err == nil {
			return int64(f), true
		}
	case string:
		// JSON round-trips can leave numeric values as strings if
		// the caller stringified them upstream. We tolerate this by
		// running through json.Number's parser, which is strict
		// enough to reject "abc" but lenient enough to accept "42".
		jn := json.Number(n)
		if i, err := jn.Int64(); err == nil {
			return i, true
		}
	}
	return 0, false
}

// toFloat64 attempts a numeric coercion to float64. Mirrors toInt64's
// shape for symmetry.
func toFloat64(v any) (float64, bool) {
	switch n := v.(type) {
	case int:
		return float64(n), true
	case int8:
		return float64(n), true
	case int16:
		return float64(n), true
	case int32:
		return float64(n), true
	case int64:
		return float64(n), true
	case uint:
		return float64(n), true
	case uint8:
		return float64(n), true
	case uint16:
		return float64(n), true
	case uint32:
		return float64(n), true
	case uint64:
		return float64(n), true
	case float32:
		return float64(n), true
	case float64:
		return n, true
	case json.Number:
		if f, err := n.Float64(); err == nil {
			return f, true
		}
	case string:
		jn := json.Number(n)
		if f, err := jn.Float64(); err == nil {
			return f, true
		}
	}
	return 0, false
}

// toString stringifies a value with the same rules the preview renderer
// uses: time.Time → RFC3339, []byte → string, fmt.Stringer → String(),
// everything else → fmt.Sprintf("%v").
func toString(v any) string {
	switch s := v.(type) {
	case string:
		return s
	case []byte:
		return string(s)
	case time.Time:
		return s.Format(time.RFC3339)
	case fmt.Stringer:
		return s.String()
	}
	return fmt.Sprintf("%v", v)
}

// -----------------------------------------------------------------------------
// Layout coordinate helpers
// -----------------------------------------------------------------------------

// computeColumnHeaderRow returns the 1-based spreadsheet row that holds
// the column header text. The header row sits immediately after the
// deepest MergeRange in the layout (interpreting MergeRange rows as
// 0-based); when no merges exist, the header row defaults to 1.
func computeColumnHeaderRow(layout PreviewLayout) int {
	headerRow := 1
	for _, mr := range layout.MergeRanges {
		// MergeRange.EndRow is 0-based; the row immediately below
		// it is EndRow+1 (still 0-based) which is EndRow+2 in
		// 1-based spreadsheet terms.
		next := mr.EndRow + 2
		if next > headerRow {
			headerRow = next
		}
	}
	return headerRow
}

// computeDataStartRow returns the 1-based spreadsheet row at which data
// rows begin. Always one row below the column header row produced by
// computeColumnHeaderRow. Exposed so property tests can re-derive the
// data area without duplicating the offset arithmetic.
func computeDataStartRow(layout PreviewLayout) int {
	return computeColumnHeaderRow(layout) + 1
}

// normalizeHex strips a leading "#" from a hex color literal so it matches
// the form excelize expects ("FFD966" rather than "#FFD966"). Empty
// strings pass through unchanged so callers can use the result as the
// sole element of a Fill.Color slice when set, or pass an empty slice
// when the value was unset upstream.
func normalizeHex(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "#") {
		return s[1:]
	}
	return s
}
