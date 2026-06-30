// Package api — Task 22.1: Full Generate → Cache → Force_Recalculate →
// Export HTTP integration test.
//
// This file exercises the master-report HTTP surface end-to-end against
// the *real* SmartLoader, ForceRecalculator, JobRegistry, ExcelExporter,
// PDFExporter, BoundedWorkerPool, and Auditor implementations wired
// onto a *api.Handler via SetMasterReportingModule. The only test seam
// is the cacheStore: we substitute an in-memory implementation
// (apiInMemCacheStore) so the test never touches Postgres, while still
// driving every other component through its production code path.
//
// What the test asserts:
//
//  1. POST /api/master-reports/{id}/generate (first call)
//     → HTTP 200, JSON.path == "recomputed"
//     → DataSource.Compute invoked exactly once
//
//  2. POST /api/master-reports/{id}/generate (second call, same filters)
//     → HTTP 200, JSON.path == "cache_hit"
//     → DataSource.Compute invocation count unchanged (still 1)
//
//  3. POST /api/master-reports/{id}/recalculate
//     → HTTP 200, JSON.path == "force_recomputed"
//     → DataSource.Compute invoked again (total 2)
//
//  4. POST /api/master-reports/{id}/generate (third call)
//     → HTTP 200, JSON.path == "cache_hit"
//     → DataSource.Compute invocation count unchanged (still 2)
//     → Payload matches the force-recomputed payload, NOT the original
//
//  5. GET /api/master-reports/{id}/export.xlsx
//     → HTTP 200
//     → Content-Type prefix matches application/vnd.openxmlformats-…
//     → Body begins with the ZIP "PK\x03\x04" magic (every .xlsx is ZIP)
//     → Body length > 0
//
//  6. GET /api/master-reports/{id}/export.pdf
//     → HTTP 200
//     → Content-Type prefix matches application/pdf
//     → Body begins with the "%PDF-" header
//     → Body length > 0
//
// Requirements covered: 4.5, 5.5, 6.2, 7.3, 12.1.
package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/sync/singleflight"

	"gps-tracking-system/internal/masterreport"
)

// -----------------------------------------------------------------------------
// In-memory cacheStore for the integration test
// -----------------------------------------------------------------------------
//
// apiInMemCacheStore is a goroutine-safe in-memory implementation of the
// package-private masterreport.cacheStore interface. We re-declare a
// dedicated implementation in the api package (rather than re-using the
// fakeCacheStore that lives in masterreport's *_test.go files, which is
// unreachable from outside the package) because Go's structural typing
// permits any concrete type with the matching method set to satisfy an
// unexported interface — only the exported types referenced in the
// method signatures need to be reachable from this package, and they
// all are.
//
// Behaviour mirrors the production *OutputCacheRepo closely enough for
// the lifecycle assertions:
//
//   - Get returns a deep-cloned *CacheRow snapshot so callers cannot
//     mutate stored state through the returned pointer.
//   - UpsertComputing transitions any row to status='computing',
//     stamping computing_since but preserving any prior payload (per
//     OutputCacheRepo semantics — Req 6.7).
//   - UpsertValid overwrites the payload, sets status='valid',
//     clears computing_since, and round-trips the payload through
//     JSON so the int64-to-float64 widening that Postgres' JSONB
//     storage imposes is reproduced here too. This ensures
//     payload-equality assertions later in the test do not falsely
//     succeed against a Go-side value that a real backend would have
//     normalised.
//   - RestorePriorStatus rolls back to the requested terminal status
//     without touching the payload.
type apiInMemCacheStore struct {
	mu   sync.Mutex
	rows map[string]*masterreport.CacheRow
}

func newAPIInMemCacheStore() *apiInMemCacheStore {
	return &apiInMemCacheStore{rows: make(map[string]*masterreport.CacheRow)}
}

// keyOf normalises the (report_id, filter_hash, operational_date) triple
// into a single string key. The operational date is truncated to its UTC
// calendar day so two clocks in different zones land on the same row.
func (c *apiInMemCacheStore) keyOf(reportID masterreport.ReportID, hash string, opDate time.Time) string {
	day := time.Date(opDate.Year(), opDate.Month(), opDate.Day(), 0, 0, 0, 0, time.UTC)
	return string(reportID) + "|" + hash + "|" + day.Format("2006-01-02")
}

func (c *apiInMemCacheStore) Get(_ context.Context, reportID masterreport.ReportID, hash string, opDate time.Time) (*masterreport.CacheRow, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	row, ok := c.rows[c.keyOf(reportID, hash, opDate)]
	if !ok {
		return nil, nil
	}
	// Return a defensive clone — callers must not mutate stored state
	// via the returned pointer.
	clone := *row
	if row.Payload != nil {
		pClone := *row.Payload
		clone.Payload = &pClone
	}
	if row.ComputingSince != nil {
		ts := *row.ComputingSince
		clone.ComputingSince = &ts
	}
	return &clone, nil
}

func (c *apiInMemCacheStore) UpsertComputing(_ context.Context, key masterreport.CacheKey, computingSince time.Time) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	k := c.keyOf(key.ReportID, key.FilterHash, key.OperationalDate)
	cs := computingSince.UTC()
	if existing, ok := c.rows[k]; ok {
		existing.Status = masterreport.CacheStatusComputing
		existing.ComputingSince = &cs
		// Payload intentionally preserved.
		return nil
	}
	c.rows[k] = &masterreport.CacheRow{
		Key: masterreport.CacheKey{
			ReportID:        key.ReportID,
			FilterHash:      key.FilterHash,
			OperationalDate: time.Date(key.OperationalDate.Year(), key.OperationalDate.Month(), key.OperationalDate.Day(), 0, 0, 0, 0, time.UTC),
		},
		Status:         masterreport.CacheStatusComputing,
		ComputedAt:     cs,
		ComputingSince: &cs,
	}
	return nil
}

func (c *apiInMemCacheStore) UpsertValid(_ context.Context, key masterreport.CacheKey, payload masterreport.Payload, inputVersion int64, computedAt time.Time) error {
	// Round-trip the payload through JSON to mirror the Postgres JSONB
	// behaviour: int64 values widen to float64 on read, []map[string]any
	// becomes []any of map[string]any, etc. This makes the
	// payload-equality assertions later in the integration test
	// resilient against representation drift between this fake and a
	// real backend.
	raw, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("apiInMemCacheStore.UpsertValid: marshal payload: %w", err)
	}
	var roundTripped masterreport.Payload
	if err := json.Unmarshal(raw, &roundTripped); err != nil {
		return fmt.Errorf("apiInMemCacheStore.UpsertValid: unmarshal payload: %w", err)
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	k := c.keyOf(key.ReportID, key.FilterHash, key.OperationalDate)
	c.rows[k] = &masterreport.CacheRow{
		Key: masterreport.CacheKey{
			ReportID:        key.ReportID,
			FilterHash:      key.FilterHash,
			OperationalDate: time.Date(key.OperationalDate.Year(), key.OperationalDate.Month(), key.OperationalDate.Day(), 0, 0, 0, 0, time.UTC),
		},
		Payload:        &roundTripped,
		InputVersion:   inputVersion,
		Status:         masterreport.CacheStatusValid,
		ComputedAt:     computedAt.UTC(),
		ComputingSince: nil,
	}
	return nil
}

func (c *apiInMemCacheStore) RestorePriorStatus(_ context.Context, key masterreport.CacheKey, priorStatus masterreport.CacheStatus) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	k := c.keyOf(key.ReportID, key.FilterHash, key.OperationalDate)
	if existing, ok := c.rows[k]; ok {
		existing.Status = priorStatus
		existing.ComputingSince = nil
	}
	return nil
}

// -----------------------------------------------------------------------------
// Deterministic DataSource with a per-call counter
// -----------------------------------------------------------------------------
//
// integrationDataSource returns a fresh Payload on every Compute call.
// Each invocation bumps an atomic counter; the test reads the counter
// to assert exactly how many recomputes happened across the lifecycle.
//
// The payload contents include the call index so successive Computes
// produce observably distinct payloads — the JSON round-trip inside
// apiInMemCacheStore.UpsertValid preserves these distinctions, letting
// the test distinguish "cache returned the force-recomputed row" from
// "cache returned the original recomputed row".
type integrationDataSource struct {
	calls int64
}

func (d *integrationDataSource) Compute(_ context.Context, _ masterreport.FilterPayload, _ *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
	idx := atomic.AddInt64(&d.calls, 1)
	return masterreport.Payload{
		Rows: []map[string]any{
			{
				"col_id":    idx,
				"col_label": fmt.Sprintf("row-%d", idx),
				"col_value": float64(idx) * 1.5,
			},
		},
		Header:       map[string]any{"source": "integration", "call_index": idx},
		GeneratedAt:  time.Now().UTC(),
		InputVersion: idx,
	}, nil
}

func (d *integrationDataSource) InputVersion(_ context.Context, _ masterreport.FilterPayload) (int64, error) {
	return atomic.LoadInt64(&d.calls), nil
}

func (d *integrationDataSource) count() int64 { return atomic.LoadInt64(&d.calls) }

// -----------------------------------------------------------------------------
// HTTP response decoding helpers
// -----------------------------------------------------------------------------

// generateResponse mirrors the JSON envelope GenerateReport and
// ForceRecalculate emit on success. Only the fields the test inspects are
// declared; encoding/json silently ignores the rest.
type generateResponse struct {
	ReportID        string                 `json:"report_id"`
	FilterHash      string                 `json:"filter_hash"`
	OperationalDate string                 `json:"operational_date"`
	Path            string                 `json:"path"`
	Payload         map[string]interface{} `json:"payload"`
}

// decodeGenerateResponse parses the JSON body and fails the test on any
// decoding error. The body must already be 200 OK; status assertions are
// the caller's job.
func decodeGenerateResponse(t *testing.T, body []byte) generateResponse {
	t.Helper()
	var out generateResponse
	if err := json.Unmarshal(body, &out); err != nil {
		t.Fatalf("decode generate response: %v\nbody: %s", err, string(body))
	}
	return out
}

// payloadRowsJSON renders the payload's "rows" field as canonical JSON so
// two response payloads can be compared as byte-equal strings. The JSON
// representation is what survives the apiInMemCacheStore.UpsertValid
// round-trip, so it's the right normalisation for cache-equality
// assertions.
func payloadRowsJSON(t *testing.T, p map[string]interface{}) string {
	t.Helper()
	rows, ok := p["rows"]
	if !ok {
		t.Fatalf("payload missing rows field: %v", p)
	}
	b, err := json.Marshal(rows)
	if err != nil {
		t.Fatalf("marshal rows: %v", err)
	}
	return string(b)
}

// -----------------------------------------------------------------------------
// TestGenerateCacheForceRecalcExport — task 22.1
// -----------------------------------------------------------------------------

// TestGenerateCacheForceRecalcExport drives the full Generate → Cache →
// Force_Recalculate → Export lifecycle over HTTP and asserts every
// observable contract at each step.
//
// Requirements covered: 4.5, 5.5, 6.2, 7.3, 12.1.
func TestGenerateCacheForceRecalcExport(t *testing.T) {
	const reportID = "integration_test_report"

	// -------------------------------------------------------------------------
	// Wire the masterreport module.
	// -------------------------------------------------------------------------

	catalog := masterreport.NewCatalog()
	ds := &integrationDataSource{}
	def := &masterreport.ReportDefinition{
		ID:       reportID,
		Name:     "Integration Test Report",
		Category: masterreport.CategoryConsolidated,
		Filters: []masterreport.FilterControl{
			{Key: masterreport.FilterDate, Required: true},
		},
		PermissionKey: "reports." + reportID + ".view",
		DataSource:    ds,
		Preview: masterreport.PreviewLayout{
			Columns: []masterreport.ColumnSpec{
				{Key: "col_id", Header: "ID", Type: "int", WidthMM: 20},
				{Key: "col_label", Header: "Label", Type: "text", WidthMM: 60},
				{Key: "col_value", Header: "Value", Type: "decimal2", WidthMM: 30},
			},
			TotalWidthMM: 110,
		},
	}
	catalog.MustRegister(def)

	cache := newAPIInMemCacheStore()
	pool := masterreport.NewBoundedWorkerPool()
	t.Cleanup(pool.Stop)
	shared := &singleflight.Group{}

	loader := masterreport.NewSmartLoader(catalog, cache, pool, shared)
	recalc := masterreport.NewForceRecalculator(catalog, cache, pool, shared)
	jobs := masterreport.NewJobRegistry(context.Background())
	t.Cleanup(jobs.Stop)

	excel, err := masterreport.NewExcelExporter(nil)
	if err != nil {
		t.Fatalf("NewExcelExporter: %v", err)
	}
	pdf := masterreport.NewPDFExporter()
	auditor := masterreport.NewAuditor(nil)

	h := &Handler{}
	h.SetMasterReportingModule(catalog, loader, recalc, jobs, excel, pdf, pool, auditor)

	// -------------------------------------------------------------------------
	// Mount routes on a fresh chi router — same as router.go does, minus
	// the auth + permission middleware so we can drive HTTP directly
	// without setting up RBAC.
	// -------------------------------------------------------------------------

	r := chi.NewRouter()
	r.Post("/api/master-reports/{report_id}/generate", h.GenerateReport)
	r.Post("/api/master-reports/{report_id}/recalculate", h.ForceRecalculate)
	r.Get("/api/master-reports/{report_id}/export.xlsx", h.ExportExcel)
	r.Get("/api/master-reports/{report_id}/export.pdf", h.ExportPDF)

	srv := httptest.NewServer(r)
	t.Cleanup(srv.Close)

	// Use a historical date so the SmartLoader's 24-hour historical TTL
	// (rather than the 60-second live-day TTL) governs cache freshness.
	// 2024-01-15 is years before this test will run, so the cache-hit
	// assertions below cannot race the live-day window.
	const filterDate = "2024-01-15"
	genBody := fmt.Sprintf(`{"filters":{"date":%q}}`, filterDate)

	httpClient := &http.Client{Timeout: 60 * time.Second}

	// -------------------------------------------------------------------------
	// Step 1: First Generate — cache miss → recomputed.
	// -------------------------------------------------------------------------

	resp1Body, resp1Status := doMRRequest(t, httpClient, http.MethodPost,
		srv.URL+"/api/master-reports/"+reportID+"/generate", "application/json",
		strings.NewReader(genBody))
	if resp1Status != http.StatusOK {
		t.Fatalf("step 1: status = %d, want 200\nbody: %s", resp1Status, resp1Body)
	}
	resp1 := decodeGenerateResponse(t, resp1Body)
	if resp1.Path != masterreport.PathRecomputed {
		t.Fatalf("step 1: path = %q, want %q\nbody: %s", resp1.Path, masterreport.PathRecomputed, resp1Body)
	}
	if got := ds.count(); got != 1 {
		t.Fatalf("step 1: Compute count = %d, want 1", got)
	}
	if rows, ok := resp1.Payload["rows"].([]interface{}); !ok || len(rows) != 1 {
		t.Fatalf("step 1: payload rows shape unexpected: %#v", resp1.Payload["rows"])
	}
	resp1RowsJSON := payloadRowsJSON(t, resp1.Payload)

	// -------------------------------------------------------------------------
	// Step 2: Second Generate — cache hit (Compute must NOT run again).
	// -------------------------------------------------------------------------

	resp2Body, resp2Status := doMRRequest(t, httpClient, http.MethodPost,
		srv.URL+"/api/master-reports/"+reportID+"/generate", "application/json",
		strings.NewReader(genBody))
	if resp2Status != http.StatusOK {
		t.Fatalf("step 2: status = %d, want 200\nbody: %s", resp2Status, resp2Body)
	}
	resp2 := decodeGenerateResponse(t, resp2Body)
	if resp2.Path != masterreport.PathCacheHit {
		t.Fatalf("step 2: path = %q, want %q\nbody: %s", resp2.Path, masterreport.PathCacheHit, resp2Body)
	}
	if got := ds.count(); got != 1 {
		t.Fatalf("step 2: Compute count = %d, want 1 (cache must NOT recompute)", got)
	}
	if got, want := payloadRowsJSON(t, resp2.Payload), resp1RowsJSON; got != want {
		t.Fatalf("step 2: payload rows != step 1 rows\nstep1: %s\nstep2: %s", want, got)
	}

	// -------------------------------------------------------------------------
	// Step 3: ForceRecalculate — bypass cache, overwrite payload.
	// -------------------------------------------------------------------------

	resp3Body, resp3Status := doMRRequest(t, httpClient, http.MethodPost,
		srv.URL+"/api/master-reports/"+reportID+"/recalculate", "application/json",
		strings.NewReader(genBody))
	if resp3Status != http.StatusOK {
		t.Fatalf("step 3: status = %d, want 200\nbody: %s", resp3Status, resp3Body)
	}
	resp3 := decodeGenerateResponse(t, resp3Body)
	if resp3.Path != masterreport.PathForceRecomputed {
		t.Fatalf("step 3: path = %q, want %q\nbody: %s", resp3.Path, masterreport.PathForceRecomputed, resp3Body)
	}
	if got := ds.count(); got != 2 {
		t.Fatalf("step 3: Compute count = %d, want 2 (one initial + one force)", got)
	}
	resp3RowsJSON := payloadRowsJSON(t, resp3.Payload)
	if resp3RowsJSON == resp1RowsJSON {
		t.Fatalf("step 3: payload == step 1 payload — force recompute did not produce new data\n%s", resp3RowsJSON)
	}

	// -------------------------------------------------------------------------
	// Step 4: Third Generate — cache hit returns the force-recomputed
	// payload (NOT the original step 1 payload).
	// -------------------------------------------------------------------------

	resp4Body, resp4Status := doMRRequest(t, httpClient, http.MethodPost,
		srv.URL+"/api/master-reports/"+reportID+"/generate", "application/json",
		strings.NewReader(genBody))
	if resp4Status != http.StatusOK {
		t.Fatalf("step 4: status = %d, want 200\nbody: %s", resp4Status, resp4Body)
	}
	resp4 := decodeGenerateResponse(t, resp4Body)
	if resp4.Path != masterreport.PathCacheHit {
		t.Fatalf("step 4: path = %q, want %q\nbody: %s", resp4.Path, masterreport.PathCacheHit, resp4Body)
	}
	if got := ds.count(); got != 2 {
		t.Fatalf("step 4: Compute count = %d, want 2 (cache must NOT recompute)", got)
	}
	if got, want := payloadRowsJSON(t, resp4.Payload), resp3RowsJSON; got != want {
		t.Fatalf("step 4: payload != step 3 force-recomputed payload\nstep3: %s\nstep4: %s", want, got)
	}
	if got := payloadRowsJSON(t, resp4.Payload); got == resp1RowsJSON {
		t.Fatalf("step 4: payload still == step 1 payload — force recompute did not overwrite cache\n%s", got)
	}

	// -------------------------------------------------------------------------
	// Step 5: Excel export — produces non-empty .xlsx with PK magic.
	// -------------------------------------------------------------------------

	xlsxURL := srv.URL + "/api/master-reports/" + reportID + "/export.xlsx?date=" + filterDate
	xlsxBody, xlsxStatus, xlsxHeader := doMRRequestWithHeader(t, httpClient, http.MethodGet, xlsxURL, "", nil)
	if xlsxStatus != http.StatusOK {
		t.Fatalf("step 5: status = %d, want 200\nbody: %s", xlsxStatus, xlsxBody)
	}
	if len(xlsxBody) == 0 {
		t.Fatalf("step 5: xlsx body empty")
	}
	const xlsxMIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	if ct := xlsxHeader.Get("Content-Type"); !strings.HasPrefix(ct, xlsxMIME) {
		t.Fatalf("step 5: Content-Type = %q, want prefix %q", ct, xlsxMIME)
	}
	// Every .xlsx is a ZIP archive; the first 4 bytes are "PK\x03\x04".
	if !bytes.HasPrefix(xlsxBody, []byte{'P', 'K', 0x03, 0x04}) {
		t.Fatalf("step 5: xlsx body does not start with PK ZIP magic; first 8 bytes: %x", xlsxBody[:min(8, len(xlsxBody))])
	}
	// Compute count is unchanged because step 4 already populated cache
	// — exports SmartLoad on the cached payload.
	if got := ds.count(); got != 2 {
		t.Fatalf("step 5: Compute count = %d, want 2 (export should hit cache)", got)
	}

	// -------------------------------------------------------------------------
	// Step 6: PDF export — produces non-empty .pdf with %PDF- magic.
	// -------------------------------------------------------------------------

	pdfURL := srv.URL + "/api/master-reports/" + reportID + "/export.pdf?date=" + filterDate
	pdfBody, pdfStatus, pdfHeader := doMRRequestWithHeader(t, httpClient, http.MethodGet, pdfURL, "", nil)
	if pdfStatus != http.StatusOK {
		t.Fatalf("step 6: status = %d, want 200\nbody: %s", pdfStatus, pdfBody)
	}
	if len(pdfBody) == 0 {
		t.Fatalf("step 6: pdf body empty")
	}
	const pdfMIME = "application/pdf"
	if ct := pdfHeader.Get("Content-Type"); !strings.HasPrefix(ct, pdfMIME) {
		t.Fatalf("step 6: Content-Type = %q, want prefix %q", ct, pdfMIME)
	}
	// Every PDF starts with "%PDF-" per ISO 32000.
	if !bytes.HasPrefix(pdfBody, []byte("%PDF-")) {
		t.Fatalf("step 6: pdf body does not start with %%PDF- magic; first 8 bytes: %x", pdfBody[:min(8, len(pdfBody))])
	}
	if got := ds.count(); got != 2 {
		t.Fatalf("step 6: Compute count = %d, want 2 (export should hit cache)", got)
	}
}

// -----------------------------------------------------------------------------
// HTTP helpers
// -----------------------------------------------------------------------------

// doMRRequest issues an HTTP request and returns (body, status). The
// response body is fully read and the response closed before the function
// returns so the caller never has to remember to close it.
//
// The "MR" prefix distinguishes this helper from the unrelated
// doRequest helper that lives in route_playback_handlers_test.go.
func doMRRequest(t *testing.T, client *http.Client, method, url, contentType string, body io.Reader) ([]byte, int) {
	t.Helper()
	out, status, _ := doMRRequestWithHeader(t, client, method, url, contentType, body)
	return out, status
}

// doMRRequestWithHeader is doMRRequest with an extra return value for the
// response header map — used by the export steps so the test can assert
// on Content-Type / Content-Disposition.
func doMRRequestWithHeader(t *testing.T, client *http.Client, method, url, contentType string, body io.Reader) ([]byte, int, http.Header) {
	t.Helper()
	req, err := http.NewRequest(method, url, body)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("client.Do %s %s: %v", method, url, err)
	}
	defer resp.Body.Close()
	buf, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	return buf, resp.StatusCode, resp.Header
}
