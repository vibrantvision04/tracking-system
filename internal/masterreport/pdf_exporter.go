// Package masterreport contains the Master Consolidated Reporting Module.
//
// This file implements PDFExporter — the .pdf renderer that every
// `GET /api/master-reports/{report_id}/export.pdf` request flows through.
// It is built on `github.com/johnfercher/maroto/v2` (design §10.1), which
// provides a declarative grid that maps cleanly onto PreviewLayout.Columns
// + MergeRanges, supports A4 / A3 landscape via the config builder, and
// produces a single self-contained byte slice through Document.GetBytes
// suitable for streaming straight to an http.ResponseWriter.
//
// Rendering flow:
//
//  1. Page-size selection. PreviewLayout.TotalWidthMM picks A4 landscape
//     (≤297mm), A3 landscape (≤420mm), or rejects with ErrExportTooWide
//     (>420mm) per Req 5.4 and Req 5.7.
//
//  2. Grid allocation. maroto's grid sums each row's column sizes to a
//     fixed MaxGridSize. We choose MaxGridSize as the larger of 12 and
//     the column count times a granularity factor, then partition the
//     grid proportionally to ColumnSpec.WidthMM using the largest-
//     remainder method so every column gets at least 1 grid unit and
//     the sum stays exactly equal to MaxGridSize. The same allocation
//     drives both header rows (where MergeRanges aggregate adjacent
//     column slots into a single cell) and data rows.
//
//  3. Title / merge band. For each row in the title region above the
//     column-header row, the exporter walks the layout's MergeRanges and
//     emits one maroto row whose cells either render the merged title
//     text (with appropriate column span and FillHex from the layout)
//     or pad the row with blank cells so the grid remains balanced.
//
//  4. Column header row. Each ColumnSpec produces one cell with its
//     Header text, FillHex background, and column-typed alignment.
//
//  5. Data rows. Each payload row produces one maroto row; each cell
//     value is formatted through formatValueForCell so numeric, date,
//     and time types render identically to the Excel exporter (which
//     satisfies the Output Equivalence property). Color rules from the
//     layout's ColorRules slice apply per-cell.
//
//  6. Totals rows. Each TotalsRow descriptor produces one maroto row.
//     The label column carries totals.Label; subsequent columns render
//     totals.Values keyed by ColumnSpec.Key. Optional FillHex tints the
//     entire totals row.
//
// Output is rendered to bytes in memory first via Document.GetBytes;
// only after that succeeds does the exporter commit the HTTP response
// headers (Content-Type: application/pdf, Content-Disposition with the
// `{report_id}_{YYYY-MM-DD}.pdf` filename). This satisfies Req 5.6's
// "no partial content on failure" semantics — a maroto Generate failure
// or context-cancellation surfaces as a returned error and the
// http.ResponseWriter is never written to.
//
// Timeouts: every Export call is wrapped in context.WithTimeout(ctx,
// 30*time.Second) per Req 5.6. Because maroto.Generate is synchronous
// and does not accept a context, the call is run in a goroutine and a
// select on ctx.Done() races against the goroutine's completion; on
// timeout the exporter returns ErrPDFRecomputeTimeout and the goroutine
// is left to finish in the background (its work is discarded).
//
// Empty payloads: a Payload with zero Rows is valid input. The exporter
// emits title merges, column headers, an empty data band, and any
// declared totals rows, producing a valid PDF per Req 5 read in
// conjunction with Req 3.6 / Req 4.7's "empty result still emits the
// header scaffolding" rule.
//
// Requirements covered: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7.
package masterreport

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/johnfercher/maroto/v2"
	"github.com/johnfercher/maroto/v2/pkg/components/col"
	"github.com/johnfercher/maroto/v2/pkg/components/text"
	"github.com/johnfercher/maroto/v2/pkg/config"
	"github.com/johnfercher/maroto/v2/pkg/consts/align"
	"github.com/johnfercher/maroto/v2/pkg/consts/fontstyle"
	"github.com/johnfercher/maroto/v2/pkg/consts/orientation"
	"github.com/johnfercher/maroto/v2/pkg/consts/pagesize"
	"github.com/johnfercher/maroto/v2/pkg/core"
	"github.com/johnfercher/maroto/v2/pkg/props"
)

// -----------------------------------------------------------------------------
// MIME type, filename, page-size, and timeout constants
// -----------------------------------------------------------------------------

// pdfMIMEType is the IANA-registered Content-Type for PDF documents
// (Req 5.3). Surfaced as a constant so HTTP handler tests can assert
// against the same literal.
const pdfMIMEType = "application/pdf"

// pdfFilenameDateFormat is the operational-date layout embedded in the
// Content-Disposition filename (Req 5.3). Stable across timezones because
// the operational date is always normalised to UTC midnight before being
// formatted.
const pdfFilenameDateFormat = "2006-01-02"

// pdfExportTimeout is the hard ceiling Export wraps every render in
// (Req 5.6). Reports that exceed this return ErrPDFRecomputeTimeout
// without committing response headers.
const pdfExportTimeout = 30 * time.Second

// pdfMaxA4WidthMM and pdfMaxA3WidthMM are the layout-width thresholds
// the exporter uses to choose between A4 landscape and A3 landscape
// (Req 5.4 / Req 5.7).
const (
	pdfMaxA4WidthMM = 297.0
	pdfMaxA3WidthMM = 420.0
)

// pdfDefaultMaxGrid is the fallback grid size used when the report has
// no declared columns. maroto requires every row's column sizes to sum
// to MaxGridSize, so we always need at least 1.
const pdfDefaultMaxGrid = 12

// pdfDataRowHeightMM is the per-data-row height in millimetres.
// Picked to fit ≥ 35 rows on an A4 landscape page (height 210mm minus
// 8mm + 12mm margins minus 14mm header band).
const (
	pdfTitleRowHeightMM  = 7.0
	pdfHeaderRowHeightMM = 7.0
	pdfDataRowHeightMM   = 5.5
	pdfTotalsRowHeightMM = 6.5
)

// -----------------------------------------------------------------------------
// Sentinel errors
// -----------------------------------------------------------------------------

// ErrExportTooWide is returned by PDFExporter.Export when the report's
// PreviewLayout.TotalWidthMM exceeds pdfMaxA3WidthMM (Req 5.7). The HTTP
// handler translates this into a 400 response with
// `error.code = export_too_wide_for_pdf`.
var ErrExportTooWide = errors.New("master report: PDF export exceeds maximum supported page width (420mm)")

// ErrPDFRecomputeTimeout is returned by PDFExporter.Export when the
// 30-second pdfExportTimeout window elapses before maroto.Generate
// completes (Req 5.6). The HTTP handler translates this into a 504
// response with `error.code = recompute_timeout, error.stage = pdf`.
var ErrPDFRecomputeTimeout = errors.New("master report: PDF export timed out after 30s")

// -----------------------------------------------------------------------------
// PDFExporter
// -----------------------------------------------------------------------------

// PDFExporter renders a Payload to a .pdf document and streams the
// bytes to an http.ResponseWriter. A single instance is constructed at
// boot and shared across every HTTP handler; the struct holds no state
// so concurrent Export calls are safe.
type PDFExporter struct{}

// NewPDFExporter constructs a PDFExporter. It accepts no configuration
// because page size, margins, and grid sizing are all derived per-call
// from the ReportDefinition's PreviewLayout.
func NewPDFExporter() *PDFExporter {
	return &PDFExporter{}
}

// Export renders payload into a .pdf document for def and streams the
// bytes to w. The HTTP response headers are committed only after a
// successful in-memory render, so a render failure produces no partial
// content on the wire (Req 5.6).
//
// Arguments:
//
//   - ctx     — request context. Wrapped internally with
//     context.WithTimeout(ctx, 30*time.Second) per Req 5.6.
//   - def     — the registered ReportDefinition. def.Preview drives the
//     page-size selection (TotalWidthMM), merge band, column headers,
//     and color rules.
//   - payload — the Payload produced by SmartLoader.Load or
//     ForceRecalculator.Recalculate. The Rows slice may be empty; an
//     empty payload still produces a valid PDF with scaffolding.
//   - opDate  — the operational date the request keyed on. Used only to
//     compose the Content-Disposition filename in YYYY-MM-DD form. The
//     date is normalised to UTC before formatting so two callers in
//     different zones produce the same filename for the same
//     operational day.
//   - w       — the destination http.ResponseWriter. Headers Content-
//     Type and Content-Disposition are set on w only after the PDF
//     bytes are fully prepared; the body bytes are then written in a
//     single Write call.
//
// Returns nil on success. Returns ErrExportTooWide when the layout's
// TotalWidthMM exceeds 420mm, ErrPDFRecomputeTimeout when generation
// exceeds 30 seconds, and a wrapped error from maroto.Generate on any
// other render failure. In every failure case no response headers are
// committed and no body bytes are written.
func (e *PDFExporter) Export(
	ctx context.Context,
	def *ReportDefinition,
	payload Payload,
	opDate time.Time,
	w http.ResponseWriter,
) error {
	if def == nil {
		return fmt.Errorf("masterreport pdf: Export called with nil ReportDefinition")
	}
	if w == nil {
		return fmt.Errorf("masterreport pdf: Export called with nil http.ResponseWriter for report %q", def.ID)
	}

	// Page-size selector (Req 5.4 / Req 5.7). The reject path runs
	// before any rendering work so a too-wide request returns
	// immediately without allocating maroto state.
	pageSize, err := choosePageSize(def.Preview.TotalWidthMM)
	if err != nil {
		return err
	}

	// 30-second hard ceiling (Req 5.6). The wrapped context is
	// honoured at two points: right before maroto.Generate starts and
	// in the select that waits for the render goroutine.
	ctx, cancel := context.WithTimeout(ctx, pdfExportTimeout)
	defer cancel()

	// Build the maroto document. Errors from buildDocument propagate
	// straight back to the caller — none of them have written to w
	// yet.
	pdfBytes, err := e.buildDocument(ctx, def, payload, pageSize)
	if err != nil {
		return err
	}

	// Commit headers AFTER render succeeds (Req 5.6). At this point
	// the in-memory PDF is fully populated and ctx is still live (the
	// goroutine inside buildDocument checked it before returning).
	w.Header().Set("Content-Type", pdfMIMEType)
	w.Header().Set(
		"Content-Disposition",
		fmt.Sprintf(`attachment; filename="%s_%s.pdf"`, def.ID, opDate.UTC().Format(pdfFilenameDateFormat)),
	)

	if _, writeErr := w.Write(pdfBytes); writeErr != nil {
		// Headers are committed; the caller cannot recover to a
		// JSON error envelope. Surface the error so the audit
		// emitter records the failure with the right outcome.
		return fmt.Errorf("masterreport pdf: stream body for %q: %w", def.ID, writeErr)
	}
	return nil
}

// buildDocument runs the maroto pipeline to bytes. It is split from
// Export so the streaming step is a single small block that is easy to
// reason about for the "headers commit only on success" guarantee.
//
// The render runs in a goroutine because maroto.Generate is synchronous
// and does not accept a context.Context; a select on ctx.Done() races
// the goroutine's completion so a hung render does not extend past
// pdfExportTimeout.
func (e *PDFExporter) buildDocument(
	ctx context.Context,
	def *ReportDefinition,
	payload Payload,
	pageSize pagesize.Type,
) ([]byte, error) {
	type result struct {
		bytes []byte
		err   error
	}
	resultCh := make(chan result, 1)

	go func() {
		defer func() {
			// maroto can panic on malformed inputs; convert
			// that to an error rather than crashing the
			// whole HTTP server.
			if r := recover(); r != nil {
				resultCh <- result{err: fmt.Errorf("masterreport pdf: render panic for %q: %v", def.ID, r)}
			}
		}()

		// Compute grid allocation once. Every row in the document
		// shares this layout.
		layout := def.Preview
		maxGrid := computePDFMaxGrid(layout.Columns)
		colSizes := allocatePDFGridSizes(layout.Columns, maxGrid)

		// Build the maroto configuration. Margins are tightened
		// from the defaults (10mm) so wide reports fit without the
		// content bleeding off the page.
		cfg := config.NewBuilder().
			WithPageSize(pageSize).
			WithOrientation(orientation.Horizontal).
			WithMaxGridSize(maxGrid).
			WithLeftMargin(8).
			WithRightMargin(8).
			WithTopMargin(8).
			WithBottomMargin(12).
			Build()

		m := maroto.New(cfg)

		// Render in order: title merges → column header → data
		// rows → totals rows.
		renderPDFTitleBand(m, layout, colSizes, maxGrid)
		renderPDFColumnHeader(m, layout, colSizes, maxGrid)
		renderPDFDataRows(m, payload, layout, colSizes, maxGrid)
		renderPDFTotalsRows(m, payload, layout, colSizes, maxGrid)

		// One last context check before the expensive
		// serialisation step.
		if err := ctx.Err(); err != nil {
			resultCh <- result{err: fmt.Errorf("masterreport pdf: context cancelled before generate for %q: %w", def.ID, err)}
			return
		}

		doc, err := m.Generate()
		if err != nil {
			resultCh <- result{err: fmt.Errorf("masterreport pdf: generate for %q: %w", def.ID, err)}
			return
		}
		resultCh <- result{bytes: doc.GetBytes()}
	}()

	select {
	case <-ctx.Done():
		// Timeout or upstream cancellation. The render goroutine
		// keeps running until it completes (maroto has no cancel
		// hook) but its result is discarded; the buffered channel
		// prevents it from blocking on send.
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return nil, ErrPDFRecomputeTimeout
		}
		return nil, fmt.Errorf("masterreport pdf: render cancelled for %q: %w", def.ID, ctx.Err())
	case r := <-resultCh:
		if r.err != nil {
			return nil, r.err
		}
		if len(r.bytes) == 0 {
			return nil, fmt.Errorf("masterreport pdf: maroto produced empty document for %q", def.ID)
		}
		return r.bytes, nil
	}
}

// -----------------------------------------------------------------------------
// Page-size selection
// -----------------------------------------------------------------------------

// choosePageSize maps the layout's TotalWidthMM to the appropriate
// pagesize constant. Returns ErrExportTooWide when the layout exceeds
// the largest supported width (Req 5.7). Orientation is always
// Landscape; the caller passes orientation.Horizontal alongside the
// returned page size when building the config.
func choosePageSize(totalWidthMM float64) (pagesize.Type, error) {
	switch {
	case totalWidthMM > pdfMaxA3WidthMM:
		return "", ErrExportTooWide
	case totalWidthMM > pdfMaxA4WidthMM:
		return pagesize.A3, nil
	default:
		return pagesize.A4, nil
	}
}

// -----------------------------------------------------------------------------
// Grid sizing
// -----------------------------------------------------------------------------

// computePDFMaxGrid picks the MaxGridSize for the maroto config. Every
// column needs at least one grid unit, so the floor is len(columns); a
// larger value lets the largest-remainder allocator achieve closer
// approximation to the declared WidthMM proportions. We use a
// granularity factor of 4 (so 5 columns → 20 grid units), capped at
// 60 to keep maroto's per-row grid traversal bounded.
//
// When there are zero columns the function returns the default fallback
// (12) so the maroto config still has a valid MaxGridSize; the empty-
// columns path renders only a placeholder row.
func computePDFMaxGrid(columns []ColumnSpec) int {
	n := len(columns)
	if n == 0 {
		return pdfDefaultMaxGrid
	}
	const granularity = 4
	const cap = 60
	g := n * granularity
	if g < pdfDefaultMaxGrid {
		g = pdfDefaultMaxGrid
	}
	if g > cap {
		g = cap
	}
	return g
}

// allocatePDFGridSizes partitions maxGrid units across the supplied
// columns using the largest-remainder method. Each column gets at
// least 1 grid unit; the sum of returned sizes equals maxGrid exactly.
// Width 0 columns share evenly; uneven decimals are distributed by the
// largest fractional remainder.
//
// Mirroring maroto's grid semantics, the returned sizes are 1-based
// integers; a column with size 3 occupies 3/maxGrid of the row width.
func allocatePDFGridSizes(columns []ColumnSpec, maxGrid int) []int {
	n := len(columns)
	if n == 0 {
		return nil
	}
	sizes := make([]int, n)
	if maxGrid < n {
		// Can't satisfy the at-least-one floor; clamp to 1 each
		// and let maroto fail loudly if the configuration is
		// inconsistent. In practice computePDFMaxGrid prevents
		// this branch.
		for i := range sizes {
			sizes[i] = 1
		}
		return sizes
	}

	total := 0.0
	for _, c := range columns {
		if c.WidthMM > 0 {
			total += c.WidthMM
		}
	}

	// Case 1: every column has zero width — distribute evenly.
	if total == 0 {
		base := maxGrid / n
		rem := maxGrid - base*n
		for i := range sizes {
			sizes[i] = base
			if i < rem {
				sizes[i]++
			}
		}
		return sizes
	}

	// Case 2: at least one positive width — proportional allocation
	// with largest-remainder reconciliation.
	type fracEntry struct {
		idx  int
		frac float64
	}
	fracs := make([]fracEntry, n)
	used := 0
	for i, c := range columns {
		w := c.WidthMM
		if w <= 0 {
			// Zero-width columns get the minimum 1 unit; their
			// remainder is left at zero so they only win ties
			// when nobody else does.
			sizes[i] = 1
			fracs[i] = fracEntry{idx: i, frac: 0}
			used++
			continue
		}
		ideal := w / total * float64(maxGrid)
		base := int(ideal)
		if base < 1 {
			base = 1
		}
		sizes[i] = base
		fracs[i] = fracEntry{idx: i, frac: ideal - float64(base)}
		used += base
	}

	// Reconcile: while used < maxGrid, give an extra unit to the
	// column with the largest fractional remainder.
	for used < maxGrid {
		// Sort by descending frac. Stable so column-order ties
		// resolve deterministically.
		sort.SliceStable(fracs, func(i, j int) bool {
			return fracs[i].frac > fracs[j].frac
		})
		sizes[fracs[0].idx]++
		fracs[0].frac = -1
		used++
	}

	// Reconcile: while used > maxGrid (possible when the minimum-1
	// floor inflates many narrow columns past their share),
	// subtract from the column with the largest size (and > 1).
	for used > maxGrid {
		bestIdx := -1
		bestSize := 1
		for i, s := range sizes {
			if s > bestSize {
				bestSize = s
				bestIdx = i
			}
		}
		if bestIdx == -1 {
			break
		}
		sizes[bestIdx]--
		used--
	}
	return sizes
}

// -----------------------------------------------------------------------------
// Render phases
// -----------------------------------------------------------------------------

// renderPDFTitleBand renders every row in the layout above the column
// header row. The title band's logical row index runs from 0 up to the
// deepest MergeRange.EndRow (inclusive); a layout with no MergeRanges
// has an empty title band and this function is a no-op.
//
// For each logical row index, the function walks the columns left to
// right. A column position is in one of three states:
//
//   - Top-left of a MergeRange that starts at this row — emit one cell
//     spanning the merge's column range with the merge's text and any
//     FillHex (column-header FillHex does not apply at the title row;
//     a future extension could add MergeRange.FillHex).
//   - Inside a MergeRange that started at an earlier row — emit a
//     blank cell at this single column position (the rendered area is
//     already covered by the earlier emission; we still need to
//     reserve a grid slot here so the row's columns sum to MaxGridSize).
//   - Not part of any MergeRange — emit a blank cell at this single
//     column position so the row stays balanced.
//
// Each emitted maroto row's column sizes must sum to maxGrid; the
// helper ensures this by padding any remaining grid units with a final
// blank cell.
func renderPDFTitleBand(m core.Maroto, layout PreviewLayout, colSizes []int, maxGrid int) {
	if len(layout.MergeRanges) == 0 {
		return
	}
	deepest := 0
	for _, mr := range layout.MergeRanges {
		if mr.EndRow > deepest {
			deepest = mr.EndRow
		}
	}

	for r := 0; r <= deepest; r++ {
		cols := buildTitleRowCols(layout, colSizes, maxGrid, r)
		if len(cols) > 0 {
			m.AddRow(pdfTitleRowHeightMM, cols...)
		}
	}
}

// buildTitleRowCols constructs the maroto columns for a single title-
// band row at logical row index r. See renderPDFTitleBand for the per-
// position state machine.
func buildTitleRowCols(layout PreviewLayout, colSizes []int, maxGrid int, r int) []core.Col {
	if len(layout.Columns) == 0 {
		// No columns: just render a full-width blank cell so the
		// title row reserves vertical space.
		return []core.Col{col.New(maxGrid).WithStyle(blankCellStyle())}
	}

	cols := make([]core.Col, 0, len(layout.Columns))
	c := 0
	for c < len(layout.Columns) {
		mr, isStart := mergeStartingAt(layout.MergeRanges, r, c)
		if isStart {
			span := mr.EndCol - mr.StartCol + 1
			if span < 1 {
				span = 1
			}
			if c+span > len(layout.Columns) {
				span = len(layout.Columns) - c
			}
			size := sumGridSlice(colSizes, c, c+span)
			cols = append(cols, mergeCell(mr.Text, size))
			c += span
			continue
		}

		// Inside an ongoing merge or unmerged territory — emit one
		// blank slot at this column position.
		cols = append(cols, col.New(colSizes[c]).WithStyle(blankCellStyle()))
		c++
	}
	return cols
}

// mergeStartingAt returns the MergeRange whose top-left corner is at
// (row, colIdx), or (nil, false) when no such merge exists.
func mergeStartingAt(merges []MergeRange, row, colIdx int) (*MergeRange, bool) {
	for i := range merges {
		mr := &merges[i]
		if mr.StartRow == row && mr.StartCol == colIdx {
			return mr, true
		}
	}
	return nil, false
}

// sumGridSlice sums sizes[from:to). Out-of-range slices are clamped to
// the available indices so a merge that runs past the last column does
// not panic.
func sumGridSlice(sizes []int, from, to int) int {
	if from < 0 {
		from = 0
	}
	if to > len(sizes) {
		to = len(sizes)
	}
	if from >= to {
		return 0
	}
	sum := 0
	for i := from; i < to; i++ {
		sum += sizes[i]
	}
	return sum
}

// mergeCell builds one merged-title cell: text centered, bold, light
// grey background to set it apart from data rows.
func mergeCell(value string, size int) core.Col {
	if size < 1 {
		size = 1
	}
	return col.New(size).Add(
		text.New(value, props.Text{
			Style:  fontstyle.Bold,
			Align:  align.Center,
			Top:    1.5,
			Size:   10,
			Family: "Arial",
		}),
	).WithStyle(&props.Cell{
		BackgroundColor: &props.Color{Red: 232, Green: 232, Blue: 232},
	})
}

// blankCellStyle returns a *props.Cell that draws a thin border and no
// fill. Used for placeholder cells inside an ongoing merge or in
// otherwise empty title positions.
func blankCellStyle() *props.Cell {
	return &props.Cell{}
}

// renderPDFColumnHeader emits one maroto row whose cells carry each
// ColumnSpec's Header text, alignment, and FillHex background. The row
// height is fixed; long header text will be truncated by maroto rather
// than wrapped onto another line, matching the in-page preview's
// single-line header convention.
func renderPDFColumnHeader(m core.Maroto, layout PreviewLayout, colSizes []int, maxGrid int) {
	if len(layout.Columns) == 0 {
		// Empty-columns case: emit a placeholder header so the
		// produced PDF still carries something visible at the
		// header position.
		m.AddRow(pdfHeaderRowHeightMM, col.New(maxGrid).Add(
			text.New(emptyHeaderPlaceholder, props.Text{
				Style:  fontstyle.Bold,
				Align:  align.Center,
				Top:    1.5,
				Size:   9,
				Family: "Arial",
			}),
		))
		return
	}

	cols := make([]core.Col, 0, len(layout.Columns))
	for i, spec := range layout.Columns {
		cols = append(cols, headerCell(spec, colSizes[i]))
	}
	m.AddRow(pdfHeaderRowHeightMM, cols...)
}

// emptyHeaderPlaceholder is the header text rendered when a report has
// zero columns declared. Practically this never happens (the Catalog
// validator rejects such definitions at boot), but the placeholder
// keeps the renderer total and the test surface clean.
const emptyHeaderPlaceholder = "(no columns)"

// headerCell builds one column-header cell with the spec's Header
// text, alignment, font weight (bold), and FillHex background.
func headerCell(spec ColumnSpec, size int) core.Col {
	cell := &props.Cell{}
	if spec.FillHex != "" {
		if c, ok := parseHexColor(spec.FillHex); ok {
			cell.BackgroundColor = c
		}
	}
	return col.New(size).Add(
		text.New(spec.Header, props.Text{
			Style:  fontstyle.Bold,
			Align:  alignmentTypeForColumnSpec(spec),
			Top:    1.5,
			Size:   9,
			Family: "Arial",
		}),
	).WithStyle(cell)
}

// renderPDFDataRows emits one maroto row per payload row. Each cell's
// value is formatted through formatValueForCell (defined in
// excel_exporter.go) so numeric, date, and time types match the Excel
// rendering exactly — this is what Property 4 (Preview ≡ Excel ≡ PDF)
// asserts.
//
// ColorRules apply per-cell: when a rule matches a cell's value, the
// cell's BackgroundColor is overridden with the rule's FillHex.
func renderPDFDataRows(m core.Maroto, payload Payload, layout PreviewLayout, colSizes []int, maxGrid int) {
	if len(layout.Columns) == 0 {
		// Render the legacy "no columns" placeholder so the empty-
		// columns case still emits at least one data band row.
		m.AddRow(pdfDataRowHeightMM, col.New(maxGrid).Add(
			text.New("", props.Text{Top: 1.5, Size: 8, Family: "Arial"}),
		))
		return
	}

	// Pre-compute the per-cell color rule index so we don't walk
	// layout.ColorRules for every cell in every row.
	rulesByCol := indexColorRulesByColumn(layout)

	for _, rowData := range payload.Rows {
		cols := make([]core.Col, 0, len(layout.Columns))
		for i, spec := range layout.Columns {
			raw, ok := rowData[spec.Key]
			var rendered string
			if ok && raw != nil {
				rendered = formatValueAsString(formatValueForCell(raw, spec.Type), spec.Type)
			}

			cellStyle := &props.Cell{}
			// Find the LAST matching rule so later rules
			// override earlier ones, matching the in-page
			// preview semantics.
			for _, rule := range rulesByCol[spec.Key] {
				if ok && ruleMatches(raw, rule.Operator, rule.Value) {
					if c, parsed := parseHexColor(rule.FillHex); parsed {
						cellStyle.BackgroundColor = c
					}
				}
			}

			cols = append(cols, col.New(colSizes[i]).Add(
				text.New(rendered, props.Text{
					Align:  alignmentTypeForColumnSpec(spec),
					Top:    1.2,
					Size:   8,
					Family: "Arial",
				}),
			).WithStyle(cellStyle))
		}
		m.AddRow(pdfDataRowHeightMM, cols...)
	}
}

// indexColorRulesByColumn buckets layout.ColorRules by ColumnKey so the
// per-cell lookup is O(rules-for-this-column) instead of O(all rules).
// Returns an empty map when the layout has no color rules so callers
// can safely index it unconditionally.
func indexColorRulesByColumn(layout PreviewLayout) map[string][]ColorRule {
	m := make(map[string][]ColorRule, len(layout.Columns))
	for _, rule := range layout.ColorRules {
		m[rule.ColumnKey] = append(m[rule.ColumnKey], rule)
	}
	return m
}

// renderPDFTotalsRows emits one maroto row per declared TotalsRow.
// Totals.Position is interpreted relative to the start of the data
// band; positive offsets render the totals row inline (rare), the
// common -1 case stacks the totals row after the last data row.
//
// In the maroto model we cannot insert a row at an arbitrary index
// retroactively, so positive positions are honoured as "render at this
// offset from the start of totals processing"; -1 entries always come
// last. This matches the Excel exporter's "label + values" emission
// shape — the visible row content is identical.
func renderPDFTotalsRows(m core.Maroto, payload Payload, layout PreviewLayout, colSizes []int, maxGrid int) {
	_ = payload // payload is unused here — totals values live on the layout descriptor
	if len(layout.TotalsRows) == 0 {
		return
	}
	if len(layout.Columns) == 0 {
		return
	}

	// Sort: rows with Position >= 0 in ascending order, then rows
	// with Position == -1 (or any negative) appended at the end. Use
	// stable sort so equal-position entries retain their declared
	// order.
	rows := make([]TotalsRow, len(layout.TotalsRows))
	copy(rows, layout.TotalsRows)
	sort.SliceStable(rows, func(i, j int) bool {
		a, b := rows[i].Position, rows[j].Position
		aEnd := a < 0
		bEnd := b < 0
		switch {
		case aEnd && !bEnd:
			return false
		case !aEnd && bEnd:
			return true
		default:
			return a < b
		}
	})

	for _, totals := range rows {
		cols := make([]core.Col, 0, len(layout.Columns))
		baseStyle := &props.Cell{}
		if totals.FillHex != "" {
			if c, ok := parseHexColor(totals.FillHex); ok {
				baseStyle.BackgroundColor = c
			}
		}

		for i, spec := range layout.Columns {
			// Column 0 carries the totals label when set; the
			// label takes precedence over any value the
			// totals descriptor would otherwise place there.
			var rendered string
			if i == 0 && totals.Label != "" {
				rendered = totals.Label
			} else if v, ok := totals.Values[spec.Key]; ok && v != nil {
				rendered = formatValueAsString(formatValueForCell(v, spec.Type), spec.Type)
			}

			cellStyle := *baseStyle // shallow copy so per-cell style stays per-cell
			cols = append(cols, col.New(colSizes[i]).Add(
				text.New(rendered, props.Text{
					Style:  fontstyle.Bold,
					Align:  alignmentTypeForColumnSpec(spec),
					Top:    1.4,
					Size:   9,
					Family: "Arial",
				}),
			).WithStyle(&cellStyle))
		}
		m.AddRow(pdfTotalsRowHeightMM, cols...)
	}
}

// -----------------------------------------------------------------------------
// Value formatting helpers
// -----------------------------------------------------------------------------

// formatValueAsString stringifies a value that has already been coerced
// by formatValueForCell into the right Go type for its column type. It
// is the PDF equivalent of how excelize renders a typed cell — Excel
// applies the number format to a numeric cell, maroto renders strings
// only, so we apply the format manually here.
//
// Type-specific rules:
//
//   - "int"      → "%d"            (signed decimal)
//   - "decimal2" → "%.2f"          (two decimal places)
//   - "date_ymd" → "2006-01-02"    (canonical date)
//   - "time_hm"  → already a string post-coercion; passthrough
//   - "text"     → already a string post-coercion; passthrough
//   - default    → fmt.Sprintf("%v", v)
//
// Nil values stringify to empty (rather than "<nil>") so empty cells
// look clean in the PDF.
func formatValueAsString(v any, typ string) string {
	if v == nil {
		return ""
	}
	switch typ {
	case "int":
		if n, ok := toInt64(v); ok {
			return fmt.Sprintf("%d", n)
		}
	case "decimal2":
		if n, ok := toFloat64(v); ok {
			return fmt.Sprintf("%.2f", n)
		}
	case "date_ymd":
		switch d := v.(type) {
		case time.Time:
			return d.UTC().Format(pdfFilenameDateFormat)
		case string:
			return d
		}
	}
	switch s := v.(type) {
	case string:
		return s
	case time.Time:
		return s.UTC().Format(time.RFC3339)
	}
	return fmt.Sprintf("%v", v)
}

// alignmentTypeForColumnSpec maps ColumnSpec.Align to maroto's align
// constant, with type-aware defaults that mirror
// alignmentFromColumnSpec in excel_exporter.go (numeric columns right-
// align, date/time columns center, everything else left).
func alignmentTypeForColumnSpec(spec ColumnSpec) align.Type {
	switch strings.ToLower(spec.Align) {
	case "left":
		return align.Left
	case "center":
		return align.Center
	case "right":
		return align.Right
	}
	switch spec.Type {
	case "int", "decimal2":
		return align.Right
	case "date_ymd", "time_hm":
		return align.Center
	}
	return align.Left
}

// -----------------------------------------------------------------------------
// Color helpers
// -----------------------------------------------------------------------------

// parseHexColor decodes a CSS-style hex color literal ("#FFD966" or
// "FFD966") into a *props.Color. Returns (nil, false) when the input
// is empty or malformed; callers should leave the cell's
// BackgroundColor unset in that case.
//
// Both 6-char ("RRGGBB") and 3-char ("RGB") shorthand forms are
// accepted; the 3-char form is expanded to its 6-char equivalent
// before parsing.
func parseHexColor(hex string) (*props.Color, bool) {
	s := strings.TrimSpace(hex)
	s = strings.TrimPrefix(s, "#")
	if len(s) == 3 {
		s = string([]byte{s[0], s[0], s[1], s[1], s[2], s[2]})
	}
	if len(s) != 6 {
		return nil, false
	}
	r, ok := parseHexByte(s[0:2])
	if !ok {
		return nil, false
	}
	g, ok := parseHexByte(s[2:4])
	if !ok {
		return nil, false
	}
	b, ok := parseHexByte(s[4:6])
	if !ok {
		return nil, false
	}
	return &props.Color{Red: int(r), Green: int(g), Blue: int(b)}, true
}

// parseHexByte decodes a 2-character hex literal into a uint8. Case-
// insensitive on the input letters. Returns (0, false) when either
// character is not a valid hex digit.
func parseHexByte(s string) (uint8, bool) {
	if len(s) != 2 {
		return 0, false
	}
	hi, ok := hexNibble(s[0])
	if !ok {
		return 0, false
	}
	lo, ok := hexNibble(s[1])
	if !ok {
		return 0, false
	}
	return hi<<4 | lo, true
}

// hexNibble decodes a single hex digit into 0..15, case-insensitively.
func hexNibble(b byte) (uint8, bool) {
	switch {
	case b >= '0' && b <= '9':
		return b - '0', true
	case b >= 'a' && b <= 'f':
		return 10 + b - 'a', true
	case b >= 'A' && b <= 'F':
		return 10 + b - 'A', true
	}
	return 0, false
}

// -----------------------------------------------------------------------------
// Type-assertion guard for unused imports (compile-time check that
// bytes.Buffer compiles in — keeps a future change that streams via a
// pipe writer non-trivial to break).
// -----------------------------------------------------------------------------

var _ bytes.Buffer
