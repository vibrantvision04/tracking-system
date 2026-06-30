package masterreport

// excel_pdf_structure_property_test.go — task 17.3 (Property 5).
//
// Property 5: Excel/PDF Structural Fidelity.
//
// For any (PreviewLayout L, Payload P) tuple the rendered .xlsx and
// .pdf must reproduce L's structural decorations verbatim:
//
//  1. Excel merge ranges equal L.MergeRanges exactly (multiset
//     equality after translating layout coordinates to Excel's A1
//     notation).
//  2. Excel column-header fill colors equal L.Columns[i].FillHex for
//     every column index i (case-insensitive hex compare, "#" prefix
//     normalised away).
//  3. Excel totals-row positions equal the spreadsheet rows the
//     exporter is contracted to write each TotalsRow into:
//     - Position ≥ 0 → dataStartRow + Position
//     - Position  < 0 → appended after the last data row (with
//       multiple negative-position rows stacking in declaration
//       order).
//  4. Excel remarks-column position equals the column index whose
//     ColumnSpec.Key matches L.RemarksColumn.Key.
//  5. PDF page size selection:
//     - A4 landscape iff TotalWidthMM ≤ 297
//     - A3 landscape iff 297 < TotalWidthMM ≤ 420
//     - Rejected with ErrExportTooWide iff TotalWidthMM > 420
//
// Test strategy
// -------------
// The five sub-properties live in five subtests of one parent test
// function so a single `go test -run TestExcelPDFStructuralFidelity`
// invocation exercises every facet. The Excel sub-properties draw the
// same (layout, payload) shape — small enough for rapid to explore
// many trials per second — and re-parse the produced .xlsx with
// excelize, asserting against the layout descriptor that produced
// the workbook.
//
// The PDF sub-properties drive the page-size selector directly
// (through the package-internal `choosePageSize` function which is
// the canonical decision point) and additionally run the full
// `PDFExporter.Export` end-to-end so the property holds at both the
// pure-function level and the byte-emitting level. Page size in the
// produced PDF is verified by extracting the `/MediaBox` from the
// raw bytes — gofpdf (which maroto wraps) writes object dictionaries
// uncompressed, so a simple regex over the bytes suffices.
//
// Generation constraints
// ----------------------
// Layouts are restricted to 2..4 columns and 0..3 data rows; that is
// enough surface area to express overlapping decorations (merges,
// totals rows, color-fills, a remarks column reference) while
// keeping each rapid trial under a few KB of xlsx and the PDF
// generation step under a few hundred milliseconds. MergeRanges are
// drawn as non-overlapping single-row blocks at row 0; that is the
// shape every registered ReportDefinition in this catalog uses, and
// it lets the merge-range assertion compare against a deterministic
// expected set without modelling rectangle overlap.
//
// Validates: Requirements 4.2, 5.4, 5.7

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http/httptest"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/xuri/excelize/v2"
	"pgregory.net/rapid"
)

// -----------------------------------------------------------------------------
// Test entry point
// -----------------------------------------------------------------------------

// TestExcelPDFStructuralFidelity is Property 5 from the
// master-consolidated-reporting spec.
//
// Validates: Requirements 4.2, 5.4, 5.7
func TestExcelPDFStructuralFidelity(t *testing.T) {
	t.Run("ExcelMergeRangesFidelity", testExcelMergeRangesFidelity)
	t.Run("ExcelHeaderFillColorsFidelity", testExcelHeaderFillColorsFidelity)
	t.Run("ExcelTotalsRowPositionsFidelity", testExcelTotalsRowPositionsFidelity)
	t.Run("ExcelRemarksColumnPositionFidelity", testExcelRemarksColumnPositionFidelity)
	t.Run("PDFPageSizeSelection", testPDFPageSizeSelection)
	t.Run("PDFRejectsWidthAboveA3", testPDFRejectsWidthAboveA3)
}


// -----------------------------------------------------------------------------
// Sub-property 1: Excel merge ranges
// -----------------------------------------------------------------------------

// testExcelMergeRangesFidelity asserts that the merge ranges
// excelize re-reads from the produced .xlsx exactly equal the set
// derived from L.MergeRanges, with coordinates translated from the
// layout's 0-based (row, col) to Excel's 1-based A1 notation.
func testExcelMergeRangesFidelity(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		layout, payload := drawStructuralLayout(rt)

		body := renderExcelToBytes(rt, layout, payload)
		f, err := excelize.OpenReader(bytes.NewReader(body))
		if err != nil {
			rt.Fatalf("open produced xlsx: %v", err)
		}
		defer func() { _ = f.Close() }()

		sheet := f.GetSheetList()[0]
		got, err := f.GetMergeCells(sheet, true)
		if err != nil {
			rt.Fatalf("GetMergeCells: %v", err)
		}

		// Expected: each MergeRange in the layout translates to
		// one "A1:Bx" range. excelize returns the start cell as
		// the lower-left coordinate alphabetically and the end
		// cell as the upper-right; our merges run left-to-right,
		// top-to-bottom so the canonical form matches what we
		// emit.
		expected := make([]string, 0, len(layout.MergeRanges))
		for _, mr := range layout.MergeRanges {
			start, err := excelize.CoordinatesToCellName(mr.StartCol+1, mr.StartRow+1)
			if err != nil {
				rt.Fatalf("expected start coord: %v", err)
			}
			end, err := excelize.CoordinatesToCellName(mr.EndCol+1, mr.EndRow+1)
			if err != nil {
				rt.Fatalf("expected end coord: %v", err)
			}
			expected = append(expected, start+":"+end)
		}

		gotAxes := make([]string, 0, len(got))
		for _, mc := range got {
			gotAxes = append(gotAxes, mc.GetStartAxis()+":"+mc.GetEndAxis())
		}

		sort.Strings(expected)
		sort.Strings(gotAxes)
		if !stringSlicesEqual(expected, gotAxes) {
			rt.Fatalf(
				"excel merge ranges differ\n  expected=%v\n  got=%v\n  layout.MergeRanges=%+v",
				expected, gotAxes, layout.MergeRanges,
			)
		}
	})
}

// -----------------------------------------------------------------------------
// Sub-property 2: Excel header fill colors
// -----------------------------------------------------------------------------

// testExcelHeaderFillColorsFidelity asserts that for every column
// index i, the fill color excelize re-reads from the column-header
// cell equals layout.Columns[i].FillHex (normalised to upper-case
// hex with no leading "#"). Columns whose FillHex is empty must
// re-read as a style with no Fill.Color set.
func testExcelHeaderFillColorsFidelity(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		layout, payload := drawStructuralLayout(rt)

		body := renderExcelToBytes(rt, layout, payload)
		f, err := excelize.OpenReader(bytes.NewReader(body))
		if err != nil {
			rt.Fatalf("open produced xlsx: %v", err)
		}
		defer func() { _ = f.Close() }()

		sheet := f.GetSheetList()[0]
		headerRow := computeColumnHeaderRow(layout)

		for i, spec := range layout.Columns {
			cell, err := excelize.CoordinatesToCellName(i+1, headerRow)
			if err != nil {
				rt.Fatalf("header coord col %d: %v", i+1, err)
			}
			styleID, err := f.GetCellStyle(sheet, cell)
			if err != nil {
				rt.Fatalf("GetCellStyle %s: %v", cell, err)
			}
			style, err := f.GetStyle(styleID)
			if err != nil {
				rt.Fatalf("GetStyle %d for %s: %v", styleID, cell, err)
			}

			gotHex := ""
			if style != nil && len(style.Fill.Color) > 0 {
				gotHex = strings.ToUpper(strings.TrimPrefix(style.Fill.Color[0], "#"))
			}
			wantHex := ""
			if spec.FillHex != "" {
				wantHex = strings.ToUpper(normalizeHex(spec.FillHex))
			}
			if gotHex != wantHex {
				rt.Fatalf(
					"column %d header fill differs: got=%q want=%q (spec.FillHex=%q, cell=%s)",
					i, gotHex, wantHex, spec.FillHex, cell,
				)
			}
		}
	})
}

// -----------------------------------------------------------------------------
// Sub-property 3: Excel totals-row positions
// -----------------------------------------------------------------------------

// testExcelTotalsRowPositionsFidelity asserts that each TotalsRow in
// L is written into the spreadsheet row the exporter's contract
// dictates. Positions ≥ 0 land at dataStartRow + Position; negative
// positions append after the last data row, with multiple negative
// entries stacking in declaration order.
//
// We verify by inspecting the column-A cell at each expected row:
// the exporter writes TotalsRow.Label there when the label is set.
// Every drawn totals row carries a unique non-empty label so the
// assertion reduces to "label X lives at row Y".
func testExcelTotalsRowPositionsFidelity(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		layout, payload := drawStructuralLayout(rt)

		body := renderExcelToBytes(rt, layout, payload)
		f, err := excelize.OpenReader(bytes.NewReader(body))
		if err != nil {
			rt.Fatalf("open produced xlsx: %v", err)
		}
		defer func() { _ = f.Close() }()

		sheet := f.GetSheetList()[0]
		dataStartRow := computeDataStartRow(layout)
		lastDataRow := dataStartRow + len(payload.Rows) - 1

		for _, totals := range layout.TotalsRows {
			var expectedRow int
			if totals.Position < 0 {
				lastDataRow++
				expectedRow = lastDataRow
			} else {
				expectedRow = dataStartRow + totals.Position
			}
			if totals.Label == "" {
				continue
			}
			cell, err := excelize.CoordinatesToCellName(1, expectedRow)
			if err != nil {
				rt.Fatalf("totals label coord row %d: %v", expectedRow, err)
			}
			got, err := f.GetCellValue(sheet, cell)
			if err != nil {
				rt.Fatalf("GetCellValue %s: %v", cell, err)
			}
			if got != totals.Label {
				rt.Fatalf(
					"totals row label at %s differs: got=%q want=%q (Position=%d, layout=%+v)",
					cell, got, totals.Label, totals.Position, layout.TotalsRows,
				)
			}
		}
	})
}

// -----------------------------------------------------------------------------
// Sub-property 4: Excel remarks-column position
// -----------------------------------------------------------------------------

// testExcelRemarksColumnPositionFidelity asserts that when L.Remarks
// Column is set, the column whose 0-based index matches
// indexOf(L.Columns, L.RemarksColumn.Key) carries that column's
// Header text at the column-header row.
//
// The exporter does not "decorate" the remarks column with any
// special style today — its semantic role is the contract between
// the layout author and downstream consumers. The structural
// fidelity property therefore reduces to: the remarks column lives
// at the position the layout claims it does and the rendered
// workbook preserves that position.
func testExcelRemarksColumnPositionFidelity(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		layout, payload := drawStructuralLayout(rt)
		if layout.RemarksColumn == nil {
			return // Property is vacuous when no remarks column is declared.
		}

		body := renderExcelToBytes(rt, layout, payload)
		f, err := excelize.OpenReader(bytes.NewReader(body))
		if err != nil {
			rt.Fatalf("open produced xlsx: %v", err)
		}
		defer func() { _ = f.Close() }()

		sheet := f.GetSheetList()[0]
		headerRow := computeColumnHeaderRow(layout)

		expectedIdx := -1
		for i, spec := range layout.Columns {
			if spec.Key == layout.RemarksColumn.Key {
				expectedIdx = i
				break
			}
		}
		if expectedIdx < 0 {
			rt.Fatalf(
				"remarks column key %q not present in layout.Columns (%+v)",
				layout.RemarksColumn.Key, layout.Columns,
			)
		}

		cell, err := excelize.CoordinatesToCellName(expectedIdx+1, headerRow)
		if err != nil {
			rt.Fatalf("remarks header coord: %v", err)
		}
		got, err := f.GetCellValue(sheet, cell)
		if err != nil {
			rt.Fatalf("GetCellValue %s: %v", cell, err)
		}
		want := layout.Columns[expectedIdx].Header
		if got != want {
			rt.Fatalf(
				"remarks-column header at %s differs: got=%q want=%q (RemarksColumn.Key=%q)",
				cell, got, want, layout.RemarksColumn.Key,
			)
		}
	})
}

// -----------------------------------------------------------------------------
// Sub-property 5: PDF page-size selection
// -----------------------------------------------------------------------------

// testPDFPageSizeSelection asserts the page-size selector picks A4
// landscape iff TotalWidthMM ≤ 297 and A3 landscape iff
// 297 < TotalWidthMM ≤ 420. The selector is verified at two levels:
//
//   - choosePageSize is the source-of-truth function the exporter
//     calls; it returns the pagesize.Type constant before any
//     rendering begins.
//   - The end-to-end Export call produces a PDF whose /MediaBox
//     reflects the same selection (A4 landscape ≈ 842×595 pts;
//     A3 landscape ≈ 1191×842 pts). We assert the MediaBox width
//     falls in the expected band for each bucket.
//
// Bucket selection uses rapid's IntRange + a Boolean discriminant
// to drive the trial into one of the two valid brackets per call.
func testPDFPageSizeSelection(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		// Pick which bucket to exercise: A4 (≤297) or A3 (297<x≤420).
		bucket := rapid.SampledFrom([]string{"A4", "A3"}).Draw(rt, "bucket")

		var totalWidthMM float64
		switch bucket {
		case "A4":
			// Draw widthMM ∈ [10, 297] inclusive. Multiply
			// rapid's int draw by 0.5 to expose fractional
			// values like 12.5 / 296.5 alongside whole numbers.
			tenths := rapid.IntRange(20, 594).Draw(rt, "a4_tenths")
			totalWidthMM = float64(tenths) / 2.0
		case "A3":
			// Draw widthMM ∈ (297, 420]. We start at 2975/10
			// = 297.5 (strictly greater than 297) and end at
			// 420.0.
			tenths := rapid.IntRange(2975, 4200).Draw(rt, "a3_tenths")
			totalWidthMM = float64(tenths) / 10.0
		}

		// Pure-function check: choosePageSize agrees with the
		// bucket the rapid trial drove the trial into.
		gotSize, err := choosePageSize(totalWidthMM)
		if err != nil {
			rt.Fatalf("choosePageSize(%v) returned error in bucket %s: %v", totalWidthMM, bucket, err)
		}
		wantSizeStr := bucket
		gotSizeStr := pdfPageSizeName(gotSize)
		if gotSizeStr != wantSizeStr {
			rt.Fatalf(
				"choosePageSize(%v) returned %s; want %s (bucket=%s)",
				totalWidthMM, gotSizeStr, wantSizeStr, bucket,
			)
		}

		// End-to-end: a layout with TotalWidthMM in this bucket
		// produces a PDF whose MediaBox width is the expected
		// page-size's width in points (±1 pt rounding).
		body := renderPDFWithWidth(rt, totalWidthMM)
		mediaWidthPt, mediaHeightPt, ok := extractFirstMediaBoxPoints(body)
		if !ok {
			rt.Fatalf(
				"could not extract /MediaBox from PDF (totalWidthMM=%v, bucket=%s, bytes=%d, head=%q)",
				totalWidthMM, bucket, len(body), firstNBytes(body, 64),
			)
		}

		// Validate the MediaBox dimensions match the expected
		// page-size in points. We allow ±1 pt tolerance to absorb
		// gofpdf's rounding of A4/A3 dimensions.
		var wantW, wantH float64
		switch bucket {
		case "A4":
			// A4 landscape: 297mm × 210mm → 841.89 × 595.28 pt.
			wantW, wantH = 841.89, 595.28
		case "A3":
			// A3 landscape: 420mm × 297mm → 1190.55 × 841.89 pt.
			wantW, wantH = 1190.55, 841.89
		}
		if !approxEqual(mediaWidthPt, wantW, 1.0) || !approxEqual(mediaHeightPt, wantH, 1.0) {
			rt.Fatalf(
				"PDF MediaBox for %s bucket differs: got=(%v, %v) pt; want≈(%v, %v) pt (totalWidthMM=%v)",
				bucket, mediaWidthPt, mediaHeightPt, wantW, wantH, totalWidthMM,
			)
		}
	})
}

// -----------------------------------------------------------------------------
// Sub-property 5b: PDF rejection above A3
// -----------------------------------------------------------------------------

// testPDFRejectsWidthAboveA3 asserts that any TotalWidthMM strictly
// greater than 420mm causes Export to return ErrExportTooWide and
// commit no body bytes — Req 5.7's hard rejection contract.
func testPDFRejectsWidthAboveA3(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		tenths := rapid.IntRange(4201, 50000).Draw(rt, "tenths_above_a3")
		totalWidthMM := float64(tenths) / 10.0

		// Pure-function path.
		if _, err := choosePageSize(totalWidthMM); !errors.Is(err, ErrExportTooWide) {
			rt.Fatalf(
				"choosePageSize(%v) should return ErrExportTooWide, got %v",
				totalWidthMM, err,
			)
		}

		// End-to-end path.
		layout := PreviewLayout{
			Columns: []ColumnSpec{
				{Key: "a", Header: "A", Type: "text", WidthMM: totalWidthMM},
			},
			TotalWidthMM: totalWidthMM,
		}
		def := &ReportDefinition{
			ID:            ReportID("excel_pdf_structure_reject_test"),
			Name:          "Excel PDF Structure Reject Test",
			Category:      CategoryConsolidated,
			PermissionKey: "reports.excel_pdf_structure_reject_test.view",
			Preview:       layout,
		}
		payload := Payload{Rows: nil, GeneratedAt: time.Now().UTC()}
		opDate := time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC)

		rec := httptest.NewRecorder()
		err := NewPDFExporter().Export(context.Background(), def, payload, opDate, rec)
		if !errors.Is(err, ErrExportTooWide) {
			rt.Fatalf(
				"PDFExporter.Export(%v) returned %v; want ErrExportTooWide",
				totalWidthMM, err,
			)
		}
		if rec.Body.Len() != 0 {
			rt.Fatalf(
				"rejected export wrote %d body bytes; want 0",
				rec.Body.Len(),
			)
		}
		if ct := rec.Header().Get("Content-Type"); ct != "" {
			rt.Fatalf(
				"rejected export committed Content-Type %q; want empty",
				ct,
			)
		}
	})
}


// -----------------------------------------------------------------------------
// Generators
// -----------------------------------------------------------------------------

// drawStructuralLayout draws a (PreviewLayout, Payload) tuple with
// non-trivial decorations:
//
//   - 2..4 columns, each with a deterministic key/header, a random
//     Type drawn from the closed set the exporters know how to
//     format, an optional FillHex, and a fixed 20mm width.
//   - 0..3 data rows of trivial scalar values keyed on each column's
//     Key. Values are present in every row so totals-row position
//     assertions have a non-empty data band to land after.
//   - 0..2 non-overlapping single-row MergeRanges anchored at row 0,
//     each carrying a unique Text. The non-overlapping invariant
//     keeps the merge-range assertion a straightforward multiset
//     comparison.
//   - 0..2 TotalsRows. Each carries a unique non-empty Label so the
//     position-fidelity assertion can identify the row that landed at
//     a given spreadsheet coordinate by its column-A label alone.
//   - An optional RemarksColumn pointing at one of the declared
//     columns, drawn 50% of the time.
//
// TotalWidthMM is set to the per-column WidthMM sum (deterministic
// for the structural-fidelity subtests; the PDF page-size subtests
// override the layout altogether and do not call this helper).
func drawStructuralLayout(rt *rapid.T) (PreviewLayout, Payload) {
	nCols := rapid.IntRange(2, 4).Draw(rt, "n_cols")
	nRows := rapid.IntRange(0, 3).Draw(rt, "n_rows")

	allTypes := []string{"text", "int", "decimal2", "date_ymd", "time_hm"}

	columns := make([]ColumnSpec, nCols)
	for i := 0; i < nCols; i++ {
		typeIdx := rapid.IntRange(0, len(allTypes)-1).Draw(rt, fmt.Sprintf("type_%d", i))

		// Optional fill: half the time, draw a hex color in the
		// upper-case canonical form ("#FFAABB"). The other half of
		// the time leave FillHex empty so the test exercises the
		// "no fill" branch on both the writer and re-reader sides.
		var fillHex string
		if rapid.Bool().Draw(rt, fmt.Sprintf("fill_present_%d", i)) {
			r := rapid.IntRange(0, 255).Draw(rt, fmt.Sprintf("fill_r_%d", i))
			g := rapid.IntRange(0, 255).Draw(rt, fmt.Sprintf("fill_g_%d", i))
			b := rapid.IntRange(0, 255).Draw(rt, fmt.Sprintf("fill_b_%d", i))
			fillHex = fmt.Sprintf("#%02X%02X%02X", r, g, b)
		}

		columns[i] = ColumnSpec{
			Key:     fmt.Sprintf("col_%d", i),
			Header:  fmt.Sprintf("Col %d", i),
			Type:    allTypes[typeIdx],
			Align:   "left",
			FillHex: fillHex,
			WidthMM: 20,
		}
	}

	// Build merges: up to 2 non-overlapping single-row blocks at row
	// 0. Each merge consumes a contiguous run of columns starting at
	// some free column; the `used` mask prevents overlap.
	var merges []MergeRange
	nMerges := rapid.IntRange(0, 2).Draw(rt, "n_merges")
	used := make([]bool, nCols)
	for m := 0; m < nMerges; m++ {
		// Find a free column to start at. If none exists we bail
		// out — drawing more would force an overlap.
		startCol := -1
		for c := 0; c < nCols; c++ {
			if !used[c] {
				startCol = c
				break
			}
		}
		if startCol < 0 {
			break
		}
		// Maximum span runs from startCol up to (but not past) the
		// next used column or the end of the column list.
		maxSpan := 0
		for c := startCol; c < nCols && !used[c]; c++ {
			maxSpan++
		}
		span := rapid.IntRange(1, maxSpan).Draw(rt, fmt.Sprintf("m_span_%d", m))
		endCol := startCol + span - 1
		for c := startCol; c <= endCol; c++ {
			used[c] = true
		}
		merges = append(merges, MergeRange{
			StartRow: 0, EndRow: 0,
			StartCol: startCol, EndCol: endCol,
			Text: fmt.Sprintf("merge_%d", m),
		})
	}

	// Build totals rows. Position is either -1 (append) or a
	// non-negative inline offset; -1 is favoured because it is
	// the common case in the registered catalog. Negative
	// positions stack in declaration order, so duplicating them
	// is well-defined; non-negative positions must be distinct
	// across the slice, otherwise a later totals row would
	// overwrite an earlier one at the same spreadsheet row and
	// the per-label position assertion would be ambiguous (the
	// exporter writes last-write-wins, which is the right
	// behaviour but undermines the test's ability to identify
	// which TotalsRow landed where). The `usedPositions` set
	// enforces that invariant; when no fresh non-negative offset
	// is available the row falls back to -1 (append).
	//
	// Labels are unique across the slice so the position-
	// fidelity assertion can use them as row identifiers.
	var totals []TotalsRow
	nTotals := rapid.IntRange(0, 2).Draw(rt, "n_totals")
	usedPositions := make(map[int]bool, nTotals)
	for tIdx := 0; tIdx < nTotals; tIdx++ {
		var position int
		appendRow := nRows == 0 || rapid.Bool().Draw(rt, fmt.Sprintf("t_append_%d", tIdx))
		if appendRow {
			position = -1
		} else {
			candidate := rapid.IntRange(0, nRows-1).Draw(rt, fmt.Sprintf("t_pos_%d", tIdx))
			if usedPositions[candidate] {
				// Fall back to append rather than redraw —
				// keeps the rapid trace deterministic across
				// the candidate draw above.
				position = -1
			} else {
				position = candidate
				usedPositions[candidate] = true
			}
		}
		totals = append(totals, TotalsRow{
			Position: position,
			Label:    fmt.Sprintf("Total_%d", tIdx),
		})
	}

	// Optional remarks column reference. When set, point at one of
	// the declared columns by its key.
	var remarks *ColumnRef
	if rapid.Bool().Draw(rt, "remarks_present") {
		idx := rapid.IntRange(0, nCols-1).Draw(rt, "remarks_idx")
		remarks = &ColumnRef{Key: columns[idx].Key}
	}

	totalWidth := 0.0
	for _, c := range columns {
		totalWidth += c.WidthMM
	}

	layout := PreviewLayout{
		Columns:       columns,
		MergeRanges:   merges,
		TotalsRows:    totals,
		RemarksColumn: remarks,
		TotalWidthMM:  totalWidth,
	}

	rows := make([]map[string]any, 0, nRows)
	for r := 0; r < nRows; r++ {
		row := make(map[string]any, nCols)
		for _, spec := range columns {
			row[spec.Key] = drawStructuralValueForType(rt, spec.Type, fmt.Sprintf("v_%d_%s", r, spec.Key))
		}
		rows = append(rows, row)
	}

	payload := Payload{Rows: rows, GeneratedAt: time.Now().UTC()}
	return layout, payload
}

// drawStructuralValueForType returns a value of the appropriate Go
// type for a given ColumnSpec.Type. The structural-fidelity subtests
// don't compare data-cell contents, so the exact values don't matter
// — they just need to be the right type so formatValueForCell does
// not coerce them to a fallback rendering.
func drawStructuralValueForType(rt *rapid.T, typ, label string) any {
	switch typ {
	case "int":
		return int64(rapid.IntRange(-1000, 1000).Draw(rt, label))
	case "decimal2":
		cents := rapid.IntRange(-99_999, 99_999).Draw(rt, label)
		return float64(cents) / 100.0
	case "date_ymd":
		offset := rapid.IntRange(0, 10_000).Draw(rt, label)
		return time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC).AddDate(0, 0, offset)
	case "time_hm":
		hour := rapid.IntRange(0, 23).Draw(rt, label+"_h")
		minute := rapid.IntRange(0, 59).Draw(rt, label+"_m")
		return time.Date(2024, 1, 1, hour, minute, 0, 0, time.UTC)
	default:
		return rapid.StringMatching(`[A-Za-z0-9_]{1,10}`).Draw(rt, label)
	}
}

// -----------------------------------------------------------------------------
// Render helpers
// -----------------------------------------------------------------------------

// renderExcelToBytes runs the ExcelExporter against the supplied
// layout/payload and returns the produced .xlsx body bytes. Fails
// the rapid trial on any exporter error.
func renderExcelToBytes(rt *rapid.T, layout PreviewLayout, payload Payload) []byte {
	def := &ReportDefinition{
		ID:            ReportID("excel_pdf_structure_test"),
		Name:          "Excel PDF Structure Test",
		Category:      CategoryConsolidated,
		PermissionKey: "reports.excel_pdf_structure_test.view",
		Preview:       layout,
	}
	exporter, err := NewExcelExporter(nil)
	if err != nil {
		rt.Fatalf("NewExcelExporter: %v", err)
	}
	opDate := time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC)
	rec := httptest.NewRecorder()
	if exportErr := exporter.Export(context.Background(), def, payload, opDate, rec); exportErr != nil {
		rt.Fatalf("ExcelExporter.Export: %v", exportErr)
	}
	return rec.Body.Bytes()
}

// renderPDFWithWidth runs the PDFExporter against a minimal layout
// whose TotalWidthMM is exactly the value supplied. Used by the
// page-size selection subtest to exercise the end-to-end render
// path for a specific width without dragging along the full
// structural decoration generator.
func renderPDFWithWidth(rt *rapid.T, totalWidthMM float64) []byte {
	layout := PreviewLayout{
		Columns: []ColumnSpec{
			{Key: "a", Header: "A", Type: "text", WidthMM: totalWidthMM},
		},
		TotalWidthMM: totalWidthMM,
	}
	def := &ReportDefinition{
		ID:            ReportID("excel_pdf_structure_pagesize_test"),
		Name:          "Excel PDF Structure PageSize Test",
		Category:      CategoryConsolidated,
		PermissionKey: "reports.excel_pdf_structure_pagesize_test.view",
		Preview:       layout,
	}
	payload := Payload{Rows: nil, GeneratedAt: time.Now().UTC()}
	opDate := time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC)
	rec := httptest.NewRecorder()
	if err := NewPDFExporter().Export(context.Background(), def, payload, opDate, rec); err != nil {
		rt.Fatalf("PDFExporter.Export(width=%v): %v", totalWidthMM, err)
	}
	return rec.Body.Bytes()
}

// -----------------------------------------------------------------------------
// PDF inspection helpers
// -----------------------------------------------------------------------------

// mediaBoxRegexp matches a /MediaBox declaration in a raw PDF byte
// stream. gofpdf (the engine maroto wraps) writes object dictionaries
// uncompressed, so the MediaBox declaration is plainly visible in
// the bytes:
//
//	/MediaBox [0.00 0.00 841.89 595.28]
//
// The leading two numbers are the origin (always 0 0 in practice);
// the trailing two are the width and height in points.
var mediaBoxRegexp = regexp.MustCompile(
	`/MediaBox\s*\[\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\]`,
)

// extractFirstMediaBoxPoints parses the first /MediaBox declaration
// in pdfBytes and returns its (width, height) in PDF points. Returns
// (0, 0, false) when no MediaBox is found or the captured numbers
// fail to parse.
func extractFirstMediaBoxPoints(pdfBytes []byte) (float64, float64, bool) {
	match := mediaBoxRegexp.FindSubmatch(pdfBytes)
	if len(match) != 5 {
		return 0, 0, false
	}
	// match[1..2] is the origin; match[3..4] is the size.
	width, err := strconv.ParseFloat(string(match[3]), 64)
	if err != nil {
		return 0, 0, false
	}
	height, err := strconv.ParseFloat(string(match[4]), 64)
	if err != nil {
		return 0, 0, false
	}
	return width, height, true
}

// pdfPageSizeName maps a maroto pagesize.Type constant back to its
// short A4/A3 name. Used by the page-size assertion to compare
// against the bucket the rapid trial drew. The comparison is
// stringwise because maroto's pagesize.Type is a typed alias whose
// underlying values are stable across releases.
func pdfPageSizeName(s any) string {
	str := fmt.Sprintf("%v", s)
	upper := strings.ToUpper(str)
	switch {
	case strings.Contains(upper, "A4"):
		return "A4"
	case strings.Contains(upper, "A3"):
		return "A3"
	}
	return upper
}

// -----------------------------------------------------------------------------
// Misc helpers
// -----------------------------------------------------------------------------

// stringSlicesEqual reports element-wise equality of two string
// slices. Used after sort.Strings on both sides so insertion order
// does not affect the result.
func stringSlicesEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// approxEqual reports whether |a - b| ≤ tol. Used by the PDF page-
// size assertion to absorb gofpdf's per-pixel rounding of the
// canonical A4 / A3 dimensions (841.89 pt rounds to either 841 or
// 842 depending on the gofpdf version).
func approxEqual(a, b, tol float64) bool {
	diff := a - b
	if diff < 0 {
		diff = -diff
	}
	return diff <= tol
}

// firstNBytes returns up to n bytes from the head of b, with
// non-printable bytes rendered as `.`, so the caller can log a
// readable preview of a failing payload without spamming the test
// output with binary noise.
func firstNBytes(b []byte, n int) string {
	if len(b) < n {
		n = len(b)
	}
	out := make([]byte, n)
	for i := 0; i < n; i++ {
		c := b[i]
		if c < 0x20 || c > 0x7e {
			out[i] = '.'
		} else {
			out[i] = c
		}
	}
	return string(out)
}
