package masterreport

// force_recalculate_property_test.go — task 11.2 (Property 8).
//
// Property 8: Force_Recalculate State Transition.
//
// For any (reportID, filter_set, priorCacheState) input combination, a
// call to ForceRecalculator.Recalculate must drive the cache row through
// the terminal state sequence
//
//	{absent, valid, stale, computing, error} → computing → valid
//
// independent of the row's prior state, and must overwrite the cached
// payload with the freshly-computed value. Concretely:
//
//  1. Recalculate returns path == PathForceRecomputed ("force_recomputed")
//     and a nil error (Req 7.7).
//  2. The cache row inspected immediately after Recalculate returns is in
//     status='valid' with the prior payload bytes replaced by the new
//     payload, regardless of which priorCacheState was seeded
//     (Req 7.3, 7.7).
//  3. The row's computed_at column equals the completion timestamp the
//     orchestrator wrote — i.e. it is within a small window around the
//     wall-clock "just now" (Req 7.7's "include the new computed_at
//     timestamp" clause).
//  4. An immediate SmartLoad for the same key observes a cache hit and
//     returns the same payload bytes ForceRecalculate handed back — the
//     two orchestrators observe identical state through the shared
//     cacheStore (Req 12.1).
//
// Test infrastructure:
//
//   - The fakeCacheStore below is an in-memory implementation of the
//     package-private cacheStore interface (recompute_common.go). It
//     mirrors the JSONB round-trip that the production *OutputCacheRepo
//     performs so payloads returned through Get see the same type fidelity
//     a Postgres-backed run would: typed numeric values stored on the way
//     in come back as float64 on the way out, exactly as JSON unmarshal
//     yields. Property assertions therefore compare payload identity via
//     a re-marshal-and-byte-equal step instead of reflect.DeepEqual.
//   - recordingDataSource is an instrumented DataSource that returns a
//     deterministic Payload built from the trial's filter_hash. Every
//     Compute call increments an atomic call counter, which the test
//     never reads directly — it exists so a future regression that calls
//     Compute zero times or many times surfaces visibly in logs.
//
// Operational date: every trial pins opDate to 2024-01-15 (UTC), several
// years before the test will ever run. That puts the date squarely in the
// HistoricalTTL = 24h regime so SmartLoad's freshness window does not
// expire between the Recalculate completion and the cache-hit assertion.
//
// Validates: Requirements 7.3, 7.7, 12.1

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"golang.org/x/sync/singleflight"
	"pgregory.net/rapid"
)

// -----------------------------------------------------------------------------
// fakeCacheStore — in-memory cacheStore for the property test
// -----------------------------------------------------------------------------

// fakeCacheStore is a goroutine-safe in-memory implementation of the
// package-private cacheStore interface used by SmartLoader and
// ForceRecalculator. Its single map is keyed by the same triple
// (report_id, filter_hash, operational_date-as-UTC-midnight) the
// production schema uses as its primary key, so two callers that share a
// CacheKey collide on the same row exactly as they would in Postgres.
//
// JSONB round-trip: UpsertValid marshals the payload to JSON, then
// immediately unmarshals it back into a new Payload value before storing
// the pointer. This is the same lossy transit a Postgres JSONB column
// imposes — typed int64 values come back as float64, time.Time round-trips
// through RFC3339Nano, etc. Mirroring that behaviour here means a test
// that holds against this fake also holds against a real database.
type fakeCacheStore struct {
	mu   sync.Mutex
	rows map[string]*CacheRow
}

func newFakeCacheStore() *fakeCacheStore {
	return &fakeCacheStore{rows: make(map[string]*CacheRow)}
}

// keyStr produces the map key. normalizeDate (output_cache_repo.go)
// collapses any in-day time to UTC midnight so two callers passing
// different times of day on the same operational day land on the same
// row.
func (f *fakeCacheStore) keyStr(reportID ReportID, hash string, opDate time.Time) string {
	return string(reportID) + "|" + hash + "|" + normalizeDate(opDate).Format("2006-01-02")
}

func (f *fakeCacheStore) Get(_ context.Context, reportID ReportID, hash string, opDate time.Time) (*CacheRow, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	row, ok := f.rows[f.keyStr(reportID, hash, opDate)]
	if !ok {
		return nil, nil
	}
	// Return a deep-ish copy so callers cannot mutate stored row state
	// out from under us. The Payload pointer is replaced with a fresh
	// allocation; ComputingSince is value-copied through a new pointer.
	copyRow := *row
	if row.Payload != nil {
		p := *row.Payload
		copyRow.Payload = &p
	}
	if row.ComputingSince != nil {
		cs := *row.ComputingSince
		copyRow.ComputingSince = &cs
	}
	return &copyRow, nil
}

func (f *fakeCacheStore) UpsertComputing(_ context.Context, key CacheKey, computingSince time.Time) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	k := f.keyStr(key.ReportID, key.FilterHash, key.OperationalDate)
	cs := computingSince.UTC()
	if existing, ok := f.rows[k]; ok {
		existing.Status = CacheStatusComputing
		existing.ComputingSince = &cs
		// payload is intentionally preserved per OutputCacheRepo semantics.
		return nil
	}
	f.rows[k] = &CacheRow{
		Key: CacheKey{
			ReportID:        key.ReportID,
			FilterHash:      key.FilterHash,
			OperationalDate: normalizeDate(key.OperationalDate),
		},
		Status:         CacheStatusComputing,
		ComputedAt:     cs,
		ComputingSince: &cs,
	}
	return nil
}

func (f *fakeCacheStore) UpsertValid(_ context.Context, key CacheKey, payload Payload, inputVersion int64, computedAt time.Time) error {
	// Mirror the Postgres JSONB round-trip so type fidelity matches a
	// real backend (int64 → float64 through json.Unmarshal into any).
	raw, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("fakeCacheStore.UpsertValid: marshal payload: %w", err)
	}
	var roundTripped Payload
	if err := json.Unmarshal(raw, &roundTripped); err != nil {
		return fmt.Errorf("fakeCacheStore.UpsertValid: unmarshal payload: %w", err)
	}

	f.mu.Lock()
	defer f.mu.Unlock()
	f.rows[f.keyStr(key.ReportID, key.FilterHash, key.OperationalDate)] = &CacheRow{
		Key: CacheKey{
			ReportID:        key.ReportID,
			FilterHash:      key.FilterHash,
			OperationalDate: normalizeDate(key.OperationalDate),
		},
		Payload:        &roundTripped,
		InputVersion:   inputVersion,
		Status:         CacheStatusValid,
		ComputedAt:     computedAt.UTC(),
		ComputingSince: nil,
		ErrorReason:    "",
	}
	return nil
}

func (f *fakeCacheStore) RestorePriorStatus(_ context.Context, key CacheKey, priorStatus CacheStatus) error {
	if !priorStatus.IsValid() {
		return fmt.Errorf("fakeCacheStore.RestorePriorStatus: invalid prior status %q", string(priorStatus))
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	row, ok := f.rows[f.keyStr(key.ReportID, key.FilterHash, key.OperationalDate)]
	if !ok {
		return nil
	}
	row.Status = priorStatus
	row.ComputingSince = nil
	return nil
}

// Compile-time assurance that the fake satisfies the same interface the
// orchestrators consume. If cacheStore grows a method in a future task,
// this assertion fails at build time instead of leaving the fake silently
// out of date.
var _ cacheStore = (*fakeCacheStore)(nil)

// -----------------------------------------------------------------------------
// recordingDataSource — deterministic DataSource for the property test
// -----------------------------------------------------------------------------

// recordingDataSource returns a Payload whose Rows include the filter
// payload serialised as JSON, plus a monotonically-increasing call index.
// The shape is irrelevant to the property under test; what matters is that
// (a) every call is observably distinct from every other call (the index)
// so a missed recompute would surface as a stale payload comparison, and
// (b) the Compute body itself is fast and side-effect-free so the bounded
// worker pool drains immediately at the end of each trial.
type recordingDataSource struct {
	calls int64
}

func (d *recordingDataSource) Compute(_ context.Context, f FilterPayload, _ *BoundedWorkerPool) (Payload, error) {
	idx := atomic.AddInt64(&d.calls, 1)
	// Serialise the filter payload deterministically. The keys are
	// FilterKey values; we walk the closed set in AllFilterKeys() order
	// so two equivalent payloads produce the same JSON regardless of
	// Go's map-iteration order.
	rendered := map[string]any{}
	for _, k := range AllFilterKeys() {
		if v, ok := f[k]; ok {
			rendered[string(k)] = fmt.Sprintf("%v", v)
		}
	}
	return Payload{
		Rows: []map[string]any{
			{
				"call_index": idx,
				"filters":    rendered,
			},
		},
		Header:       map[string]any{"source": "recording"},
		GeneratedAt:  time.Now().UTC(),
		InputVersion: idx,
	}, nil
}

func (d *recordingDataSource) InputVersion(_ context.Context, _ FilterPayload) (int64, error) {
	return atomic.LoadInt64(&d.calls), nil
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

// fixedOpDate is a clearly-historical operational date. Both the
// HistoricalTTL = 24h and the test's wall-clock proximity assertions
// remain stable regardless of when the test suite runs.
var fixedOpDate = time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)

// seedPriorState mutates the cache so the key starts in the requested
// CacheStatus before the property body runs. Every branch leaves the row
// in a state the production cache could plausibly be in: 'valid' rows
// carry a fully-formed (but stale-relative) prior payload; 'stale' and
// 'error' rows reach their target via the same RestorePriorStatus call
// path SmartLoader and ForceRecalculator use in their rollback branches.
func seedPriorState(t *testing.T, store *fakeCacheStore, key CacheKey, state string) {
	t.Helper()
	ctx := context.Background()
	priorPayload := Payload{
		Rows:         []map[string]any{{"prior": true}},
		Header:       map[string]any{"source": "prior"},
		GeneratedAt:  time.Now().Add(-2 * time.Hour).UTC(),
		InputVersion: 1,
	}
	switch state {
	case "absent":
		// No-op: leave the row absent so Recalculate goes through the
		// "no prior" branch that maps to status='error' on rollback.
	case "valid":
		if err := store.UpsertValid(ctx, key, priorPayload, 1, time.Now().Add(-2*time.Hour)); err != nil {
			t.Fatalf("seed valid: %v", err)
		}
	case "stale":
		if err := store.UpsertValid(ctx, key, priorPayload, 1, time.Now().Add(-2*time.Hour)); err != nil {
			t.Fatalf("seed stale (upsert): %v", err)
		}
		if err := store.RestorePriorStatus(ctx, key, CacheStatusStale); err != nil {
			t.Fatalf("seed stale (restore): %v", err)
		}
	case "computing":
		if err := store.UpsertComputing(ctx, key, time.Now().Add(-30*time.Second)); err != nil {
			t.Fatalf("seed computing: %v", err)
		}
	case "error":
		if err := store.UpsertValid(ctx, key, priorPayload, 1, time.Now().Add(-2*time.Hour)); err != nil {
			t.Fatalf("seed error (upsert): %v", err)
		}
		if err := store.RestorePriorStatus(ctx, key, CacheStatusError); err != nil {
			t.Fatalf("seed error (restore): %v", err)
		}
	default:
		t.Fatalf("seedPriorState: unknown state %q", state)
	}
}

// payloadsEqual checks payload identity by re-marshaling both sides to
// JSON. Direct reflect.DeepEqual fails after a JSONB round-trip because
// int64 values inside map[string]any become float64; encoding/json
// re-emits both as the same digit string, so byte-equality of the
// re-marshaled output is the right equivalence here.
func payloadsEqual(a, b Payload) (bool, string, string) {
	aBytes, err := json.Marshal(a)
	if err != nil {
		return false, err.Error(), ""
	}
	bBytes, err := json.Marshal(b)
	if err != nil {
		return false, "", err.Error()
	}
	return string(aBytes) == string(bBytes), string(aBytes), string(bBytes)
}

// -----------------------------------------------------------------------------
// Property test
// -----------------------------------------------------------------------------

// TestForceRecalculateStateTransition is Property 8 from the
// master-consolidated-reporting spec — the Force_Recalculate state
// transition property.
//
// Validates: Requirements 7.3, 7.7, 12.1
func TestForceRecalculateStateTransition(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		// Fresh wiring per trial. The catalog, fakeCacheStore, pool,
		// and shared singleflight group are all trial-local so rapid's
		// minimisation does not have to reason about cross-trial
		// state.
		ds := &recordingDataSource{}
		catalog := NewCatalog()
		reportID := ReportID("force_recalc_property_report")
		def := &ReportDefinition{
			ID:            reportID,
			Name:          "Force Recalc Property Test",
			Category:      CategoryConsolidated,
			PermissionKey: "reports.force_recalc_property_report.view",
			DataSource:    ds,
			Preview:       PreviewLayout{},
		}
		catalog.MustRegister(def)

		store := newFakeCacheStore()
		pool := NewBoundedWorkerPool()
		defer pool.Stop()

		sharedGroup := &singleflight.Group{}
		fr := NewForceRecalculator(catalog, store, pool, sharedGroup)
		sl := NewSmartLoader(catalog, store, pool, sharedGroup)

		// Generate the trial inputs. The filter hash is an opaque
		// 64-character lowercase hex string — the production cache
		// row's filter_hash CHAR(64) column accepts the same shape,
		// and using random hex keeps every trial on a distinct
		// CacheKey so prior-state seeding never leaks across the
		// fakeCacheStore.
		filterHash := rapid.StringMatching(`^[a-f0-9]{64}$`).Draw(rt, "filter_hash")
		priorState := rapid.SampledFrom([]string{
			"absent", "valid", "stale", "computing", "error",
		}).Draw(rt, "prior_state")

		// The filter payload itself does not influence the cache key
		// (which is keyed by the explicit filterHash above) but it is
		// passed through to DataSource.Compute, so we generate a
		// representative shape with the required date filter set.
		filterDay := rapid.Int32Range(0, 364).Draw(rt, "filter_day")
		filters := FilterPayload{
			FilterDate: fixedOpDate.AddDate(0, 0, int(filterDay)),
		}

		key := CacheKey{
			ReportID:        reportID,
			FilterHash:      filterHash,
			OperationalDate: fixedOpDate,
		}
		seedPriorState(t, store, key, priorState)

		ctx := context.Background()

		// (1) Force_Recalculate the key.
		recompStart := time.Now().UTC()
		payload, path, err := fr.Recalculate(ctx, reportID, filterHash, fixedOpDate, filters)
		recompEnd := time.Now().UTC()

		if err != nil {
			rt.Fatalf("Recalculate(prior=%s) returned err: %v", priorState, err)
		}
		if path != PathForceRecomputed {
			rt.Fatalf("Recalculate(prior=%s) returned path=%q, want %q", priorState, path, PathForceRecomputed)
		}

		// (2) Cache row terminal state must be 'valid'.
		row, err := store.Get(ctx, reportID, filterHash, fixedOpDate)
		if err != nil {
			rt.Fatalf("store.Get after Recalculate(prior=%s): %v", priorState, err)
		}
		if row == nil {
			rt.Fatalf("Recalculate(prior=%s) left no cache row", priorState)
		}
		if row.Status != CacheStatusValid {
			rt.Fatalf("Recalculate(prior=%s) terminal status=%q, want %q", priorState, row.Status, CacheStatusValid)
		}
		if row.ComputingSince != nil {
			rt.Fatalf("Recalculate(prior=%s) left computing_since=%v, want nil after success", priorState, *row.ComputingSince)
		}

		// (3) computed_at must lie within the Recalculate execution
		// window. Allowing a one-second slack on each side absorbs
		// scheduler jitter without masking a clock-skew regression
		// (Force_Recalculate stamps completedAt via f.now().UTC()
		// which sits between recompStart and recompEnd in real time).
		windowLow := recompStart.Add(-time.Second)
		windowHigh := recompEnd.Add(time.Second)
		if row.ComputedAt.Before(windowLow) || row.ComputedAt.After(windowHigh) {
			rt.Fatalf(
				"Recalculate(prior=%s) computed_at=%v outside [%v, %v]",
				priorState, row.ComputedAt, windowLow, windowHigh,
			)
		}

		// (4) The cached payload must equal what Recalculate returned.
		if row.Payload == nil {
			rt.Fatalf("Recalculate(prior=%s) left row.Payload=nil after status=valid", priorState)
		}
		if ok, want, got := payloadsEqual(payload, *row.Payload); !ok {
			rt.Fatalf(
				"Recalculate(prior=%s) returned payload != cached payload\nreturned: %s\ncached:   %s",
				priorState, want, got,
			)
		}

		// (5) An immediate SmartLoad for the same key returns a cache
		// hit whose payload byte-equals the recomputed payload.
		smartPayload, smartPath, err := sl.Load(ctx, reportID, filterHash, fixedOpDate, filters)
		if err != nil {
			rt.Fatalf("SmartLoad after Recalculate(prior=%s): %v", priorState, err)
		}
		if smartPath != PathCacheHit {
			rt.Fatalf("SmartLoad after Recalculate(prior=%s) path=%q, want %q", priorState, smartPath, PathCacheHit)
		}
		if ok, want, got := payloadsEqual(payload, smartPayload); !ok {
			rt.Fatalf(
				"SmartLoad payload != Recalculate payload (prior=%s)\nforce: %s\nsmart: %s",
				priorState, want, got,
			)
		}
	})
}
