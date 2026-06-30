package masterreport

// integration_test.go — task 22.1.
//
// Full lifecycle integration test exercising the Generate → Cache →
// Force_Recalculate → Export cycle end-to-end against the real
// SmartLoader, ForceRecalculator, ExcelExporter, and PDFExporter
// implementations.
//
// The test runs entirely in-memory:
//
//   - The cache layer is the in-memory fakeCacheStore declared in
//     force_recalculate_property_test.go. It mirrors the production
//     OutputCacheRepo's status machine and JSONB round-trip exactly,
//     so the orchestrators see the same state transitions they would
//     against Postgres without the container start-up cost.
//   - The DataSource is bumpingDataSource — a deterministic mock that
//     returns predictable payloads and bumps GeneratedAt + a call
//     counter on every invocation so each Compute output is observably
//     distinct from the previous one.
//   - A minimal ReportDefinition registered in a fresh Catalog wires
//     the DataSource to a single report id; the PreviewLayout is the
//     same flat-column shape used by the property tests so the real
//     ExcelExporter (programmatic fallback path) and PDFExporter
//     render cleanly without a template file on disk.
//   - The exporters write through httptest.NewRecorder so we can
//     inspect both the response headers (Content-Type,
//     Content-Disposition) and the body bytes (PK magic for xlsx,
//     %PDF magic for pdf).
//
// What the test asserts at each step:
//
//   1. Initial Generate (SmartLoader.Load) → path == "recomputed",
//      payload returned, cache row stamped status='valid', exactly
//      one Compute invocation, computed_at recorded.
//   2. Second Generate immediately after → path == "cache_hit",
//      payload byte-equal to the first (after JSONB round-trip),
//      Compute counter unchanged.
//   3. ForceRecalculate → path == "force_recomputed", payload
//      returned, computed_at strictly newer than step 1's, a second
//      Compute invocation recorded, cache row status='valid'.
//   4. Subsequent Generate → path == "cache_hit", payload byte-equal
//      to the force-recomputed payload (NOT the original step 1
//      payload), Compute counter still unchanged from step 3.
//   5. Excel export — writes a non-zero .xlsx, body begins with the
//      "PK\x03\x04" ZIP magic bytes (every .xlsx is a ZIP archive),
//      Content-Type set to the openxml MIME, Content-Disposition
//      includes the report_id and operational date.
//   6. PDF export — writes a non-zero .pdf, body begins with the
//      "%PDF-" magic bytes (every PDF starts with this header),
//      Content-Type set to application/pdf, Content-Disposition
//      includes the report_id and operational date.
//
// Requirements covered: 4.5, 5.5, 6.2, 7.3, 12.1.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"golang.org/x/sync/singleflight"
)

// -----------------------------------------------------------------------------
// bumpingDataSource — deterministic DataSource with monotonic call counter
// -----------------------------------------------------------------------------

// bumpingDataSource returns a fresh Payload on every Compute call. The
// Rows include the call index so two Computes are observably distinct
// even after the JSONB round-trip (int64 → float64 → JSON re-marshal),
// and GeneratedAt is stamped from the test-controlled now() function so
// the integration test can assert strict monotonicity of computed_at
// across the SmartLoad → ForceRecalc transition without depending on
// wall-clock resolution.
type bumpingDataSource struct {
	calls int64
	now   func() time.Time
}

func (d *bumpingDataSource) Compute(_ context.Context, _ FilterPayload, _ *BoundedWorkerPool) (Payload, error) {
	idx := atomic.AddInt64(&d.calls, 1)
	return Payload{
		Rows: []map[string]any{
			{
				"col_id":    idx,
				"col_label": fmt.Sprintf("row-%d", idx),
				"col_value": float64(idx) * 1.5,
			},
		},
		Header:       map[string]any{"source": "bumping", "call_index": idx},
		GeneratedAt:  d.now(),
		InputVersion: idx,
	}, nil
}

func (d *bumpingDataSource) InputVersion(_ context.Context, _ FilterPayload) (int64, error) {
	return atomic.LoadInt64(&d.calls), nil
}

func (d *bumpingDataSource) count() int64 { return atomic.LoadInt64(&d.calls) }

// -----------------------------------------------------------------------------
// Test helpers
// -----------------------------------------------------------------------------

// integrationLayout is the PreviewLayout used by the lifecycle test. It
// is intentionally minimal so both exporters render a small but
// valid document. The column count matches bumpingDataSource's Rows
// schema (col_id / col_label / col_value).
func integrationLayout() PreviewLayout {
	return PreviewLayout{
		Columns: []ColumnSpec{
			{Key: "col_id", Header: "ID", Type: "int", WidthMM: 20},
			{Key: "col_label", Header: "Label", Type: "text", WidthMM: 60},
			{Key: "col_value", Header: "Value", Type: "decimal2", WidthMM: 30},
		},
		TotalWidthMM: 110,
	}
}

// jsonBytes marshals v to canonical JSON bytes for byte-equality
// assertions. Both payloads compared in this test pass through the
// fakeCacheStore's JSONB round-trip exactly once before reaching the
// caller, so a direct reflect.DeepEqual on the returned Payload values
// trips on the int64-to-float64 widening. Marshaling both sides to
// JSON normalizes that representation difference and yields stable
// byte-level equivalence.
func jsonBytes(t *testing.T, v any) []byte {
	t.Helper()
	out, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return out
}

// -----------------------------------------------------------------------------
// TestIntegrationFullLifecycle — task 22.1
// -----------------------------------------------------------------------------

// TestIntegrationFullLifecycle drives the full Generate → Cache →
// Force_Recalculate → Export pipeline against in-memory wiring and
// asserts every observable contract at each step.
//
// Requirements covered: 4.5, 5.5, 6.2, 7.3, 12.1.
func TestIntegrationFullLifecycle(t *testing.T) {
	// Time control — every clock-reading component (SmartLoader,
	// ForceRecalculator, bumpingDataSource) reads through nowFn, so
	// advancing the integer tick deterministically orders computed_at
	// stamps across the lifecycle without sleeping.
	var nowTick int64
	baseTime := time.Date(2024, 1, 15, 12, 0, 0, 0, time.UTC)
	nowFn := func() time.Time {
		// Advance by 1 second on every read. This guarantees the
		// SmartLoad → ForceRecalc transition produces a strictly
		// later computed_at without us juggling explicit advances
		// in the test body.
		n := atomic.AddInt64(&nowTick, 1)
		return baseTime.Add(time.Duration(n) * time.Second)
	}

	// Operational date — historical (2024-01-15 is years before this
	// test will ever run). HistoricalTTL = 24h, so the cache-hit
	// assertions at steps 2 and 4 never race the freshness window.
	opDate := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)

	const reportID ReportID = "integration_lifecycle_report"
	const filterHash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

	// Catalog + DataSource + ReportDefinition.
	catalog := NewCatalog()
	ds := &bumpingDataSource{now: nowFn}
	def := &ReportDefinition{
		ID:            reportID,
		Name:          "Integration Lifecycle Report",
		Category:      CategoryConsolidated,
		PermissionKey: "reports.integration_lifecycle_report.view",
		DataSource:    ds,
		Preview:       integrationLayout(),
	}
	catalog.MustRegister(def)

	// In-memory cache + shared singleflight group (the same instance
	// the production wiring passes to both orchestrators per Req 7.8).
	store := newFakeCacheStore()
	pool := NewBoundedWorkerPool()
	t.Cleanup(pool.Stop)
	shared := &singleflight.Group{}

	loader := newSmartLoaderWithStore(catalog, store, pool, shared, nowFn)
	fr := &ForceRecalculator{
		catalog: catalog,
		cache:   store,
		pool:    pool,
		group:   shared,
		now:     nowFn,
	}

	ctx := context.Background()
	filters := FilterPayload{FilterDate: opDate}

	// -------------------------------------------------------------------------
	// Step 1: Initial Generate — cache miss → recompute.
	// -------------------------------------------------------------------------

	step1Payload, step1Path, err := loader.Load(ctx, reportID, filterHash, opDate, filters)
	if err != nil {
		t.Fatalf("step 1 Load: %v", err)
	}
	if step1Path != PathRecomputed {
		t.Fatalf("step 1 path = %q, want %q", step1Path, PathRecomputed)
	}
	if len(step1Payload.Rows) != 1 {
		t.Fatalf("step 1 payload rows = %d, want 1", len(step1Payload.Rows))
	}
	if ds.count() != 1 {
		t.Fatalf("step 1 Compute count = %d, want 1", ds.count())
	}

	row, err := store.Get(ctx, reportID, filterHash, opDate)
	if err != nil {
		t.Fatalf("step 1 store.Get: %v", err)
	}
	if row == nil {
		t.Fatalf("step 1: cache row missing after recompute")
	}
	if row.Status != CacheStatusValid {
		t.Fatalf("step 1 cache status = %q, want %q", row.Status, CacheStatusValid)
	}
	step1ComputedAt := row.ComputedAt

	// -------------------------------------------------------------------------
	// Step 2: Second Generate immediately after — cache hit.
	// -------------------------------------------------------------------------

	step2Payload, step2Path, err := loader.Load(ctx, reportID, filterHash, opDate, filters)
	if err != nil {
		t.Fatalf("step 2 Load: %v", err)
	}
	if step2Path != PathCacheHit {
		t.Fatalf("step 2 path = %q, want %q", step2Path, PathCacheHit)
	}
	if ds.count() != 1 {
		t.Fatalf("step 2 Compute count = %d, want 1 (cache must NOT recompute)", ds.count())
	}
	// Byte-equality is the right equivalence here: both payloads have
	// passed through the cache's JSONB round-trip the same number of
	// times (step 1 went through once via UpsertValid; step 2 reads
	// the same stored copy back), so their JSON encodings match.
	if got, want := string(jsonBytes(t, step2Payload)), string(jsonBytes(t, step1Payload)); got != want {
		t.Fatalf("step 2 payload != step 1 payload\nstep1: %s\nstep2: %s", want, got)
	}

	// -------------------------------------------------------------------------
	// Step 3: ForceRecalculate — bypass cache, overwrite payload.
	// -------------------------------------------------------------------------

	step3Payload, step3Path, err := fr.Recalculate(ctx, reportID, filterHash, opDate, filters)
	if err != nil {
		t.Fatalf("step 3 Recalculate: %v", err)
	}
	if step3Path != PathForceRecomputed {
		t.Fatalf("step 3 path = %q, want %q", step3Path, PathForceRecomputed)
	}
	if ds.count() != 2 {
		t.Fatalf("step 3 Compute count = %d, want 2 (one initial + one force)", ds.count())
	}
	if len(step3Payload.Rows) != 1 {
		t.Fatalf("step 3 payload rows = %d, want 1", len(step3Payload.Rows))
	}
	// Verify the force-recompute produced a strictly NEW payload.
	// bumpingDataSource bumps its call counter on every Compute, so
	// the second payload's call_index differs from the first.
	if got, want := string(jsonBytes(t, step3Payload)), string(jsonBytes(t, step1Payload)); got == want {
		t.Fatalf("step 3 payload == step 1 payload — force recompute did not produce new data\n%s", want)
	}

	row, err = store.Get(ctx, reportID, filterHash, opDate)
	if err != nil {
		t.Fatalf("step 3 store.Get: %v", err)
	}
	if row == nil {
		t.Fatalf("step 3: cache row missing after force recompute")
	}
	if row.Status != CacheStatusValid {
		t.Fatalf("step 3 cache status = %q, want %q", row.Status, CacheStatusValid)
	}
	if !row.ComputedAt.After(step1ComputedAt) {
		t.Fatalf(
			"step 3 computed_at (%v) must be strictly after step 1 (%v) per Req 7.7",
			row.ComputedAt, step1ComputedAt,
		)
	}

	// -------------------------------------------------------------------------
	// Step 4: Subsequent Generate — cache hit returns the
	// force-recomputed payload (NOT the original step 1 payload).
	// -------------------------------------------------------------------------

	step4Payload, step4Path, err := loader.Load(ctx, reportID, filterHash, opDate, filters)
	if err != nil {
		t.Fatalf("step 4 Load: %v", err)
	}
	if step4Path != PathCacheHit {
		t.Fatalf("step 4 path = %q, want %q", step4Path, PathCacheHit)
	}
	if ds.count() != 2 {
		t.Fatalf("step 4 Compute count = %d, want 2 (cache must NOT recompute)", ds.count())
	}
	if got, want := string(jsonBytes(t, step4Payload)), string(jsonBytes(t, step3Payload)); got != want {
		t.Fatalf("step 4 payload != step 3 force-recomputed payload\nstep3: %s\nstep4: %s", want, got)
	}
	// And it must NOT match the original step 1 payload — confirming
	// the cache was overwritten by ForceRecalculate (Req 7.3, 12.1).
	if got, want := string(jsonBytes(t, step4Payload)), string(jsonBytes(t, step1Payload)); got == want {
		t.Fatalf("step 4 payload still == step 1 payload — force recompute did not overwrite cache")
	}

	// -------------------------------------------------------------------------
	// Step 5: Excel export — produces non-empty .xlsx with PK magic.
	// -------------------------------------------------------------------------

	// NewExcelExporter with nil catalog yields an exporter that renders
	// every workbook programmatically from PreviewLayout, which is what
	// we want here.
	excelExporter, err := NewExcelExporter(nil)
	if err != nil {
		t.Fatalf("step 5 NewExcelExporter: %v", err)
	}
	excelRec := httptest.NewRecorder()
	if err := excelExporter.Export(ctx, def, step4Payload, opDate, excelRec); err != nil {
		t.Fatalf("step 5 ExcelExporter.Export: %v", err)
	}
	excelBody := excelRec.Body.Bytes()
	if len(excelBody) == 0 {
		t.Fatalf("step 5: ExcelExporter produced empty body")
	}
	// Every .xlsx is a ZIP archive; the first 4 bytes are the ZIP
	// "PK\x03\x04" local-file-header magic. This is the cheapest
	// possible smoke test that the body is actually a valid xlsx
	// without re-parsing the workbook.
	if !bytes.HasPrefix(excelBody, []byte{'P', 'K', 0x03, 0x04}) {
		t.Fatalf("step 5: ExcelExporter body does not start with PK ZIP magic; first 8 bytes: %x", excelBody[:min(8, len(excelBody))])
	}
	if got := excelRec.Header().Get("Content-Type"); got != xlsxMIMEType {
		t.Fatalf("step 5 Content-Type = %q, want %q", got, xlsxMIMEType)
	}
	disposition := excelRec.Header().Get("Content-Disposition")
	if !strings.Contains(disposition, string(reportID)) || !strings.Contains(disposition, "2024-01-15") {
		t.Fatalf("step 5 Content-Disposition = %q, missing report_id or op_date", disposition)
	}

	// -------------------------------------------------------------------------
	// Step 6: PDF export — produces non-empty .pdf with %PDF magic.
	// -------------------------------------------------------------------------

	pdfExporter := NewPDFExporter()
	pdfRec := httptest.NewRecorder()
	if err := pdfExporter.Export(ctx, def, step4Payload, opDate, pdfRec); err != nil {
		t.Fatalf("step 6 PDFExporter.Export: %v", err)
	}
	pdfBody := pdfRec.Body.Bytes()
	if len(pdfBody) == 0 {
		t.Fatalf("step 6: PDFExporter produced empty body")
	}
	// Every PDF starts with the "%PDF-" header per ISO 32000.
	if !bytes.HasPrefix(pdfBody, []byte("%PDF-")) {
		t.Fatalf("step 6: PDFExporter body does not start with %%PDF- magic; first 8 bytes: %x", pdfBody[:min(8, len(pdfBody))])
	}
	if got := pdfRec.Header().Get("Content-Type"); got != pdfMIMEType {
		t.Fatalf("step 6 Content-Type = %q, want %q", got, pdfMIMEType)
	}
	disposition = pdfRec.Header().Get("Content-Disposition")
	if !strings.Contains(disposition, string(reportID)) || !strings.Contains(disposition, "2024-01-15") {
		t.Fatalf("step 6 Content-Disposition = %q, missing report_id or op_date", disposition)
	}
}
