package masterreport

// coalesce_property_test.go — task 10.3 (Property 7).
//
// Property 7: Concurrent Recompute Coalescence.
//
// SmartLoader (smart_loader.go) and ForceRecalculator (force_recalculate.go)
// share a single *singleflight.Group keyed by (report_id, filter_hash,
// operational_date). The contract: when N ∈ [2, 32] concurrent same-key
// requests arrive within the same in-flight window, the underlying
// DataSource.Compute is invoked exactly once across all N requests, and
// every caller observes the same final payload (or the same coalesced
// error). This is the in-process half of Req 6.6 / 7.8 / 12.4; cross-
// process coalescence is provided by the cache row's `computing` status
// flag (covered by SmartLoader's poll loop, not this property).
//
// The test exercises the contract directly:
//
//   1. Build a one-report Catalog wrapping an instrumented DataSource
//      whose Compute increments an atomic counter and sleeps briefly so
//      the singleflight window stays wide enough for every concurrent
//      caller to land inside it.
//   2. Build an in-memory cacheStore so the test does not require a live
//      Postgres connection. The store is empty at the start of every
//      iteration so every Load / Recalculate path goes through recompute
//      (cache miss → UpsertComputing → Compute → UpsertValid).
//   3. Build a SmartLoader and a ForceRecalculator sharing the same
//      singleflight.Group (the shared-pointer plumbing that Req 7.8
//      depends on).
//   4. Launch N goroutines released by a barrier channel. Each goroutine
//      independently picks SmartLoad or ForceRecalculate (rapid-generated
//      per-call). Mixed call types exercise the cross-action coalescence
//      path specifically.
//   5. Wait for all goroutines, then assert:
//        - DataSource.Compute counter == 1
//        - Every returned payload equals the DataSource's fixed payload
//          (GeneratedAt and InputVersion are the discriminators)
//        - Every returned path is non-empty (cache_hit, recomputed, or
//          force_recomputed — whichever the singleflight leader produced)
//
// Validates: Requirements 6.6, 7.8, 12.4

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"pgregory.net/rapid"
)

// -----------------------------------------------------------------------------
// In-memory cacheStore for tests
// -----------------------------------------------------------------------------

// inMemCacheStore is a minimal cacheStore implementation backed by an
// in-memory map. It satisfies the same contract as *OutputCacheRepo without
// requiring a live Postgres connection, which would put unacceptable setup
// cost on what is fundamentally an in-process concurrency invariant test.
//
// All methods take the package mutex; concurrent Get/UpsertComputing/
// UpsertValid calls during a coalesced recompute are correctly serialised.
// Get returns deep-ish copies so callers cannot mutate stored state.
type inMemCacheStore struct {
	mu   sync.Mutex
	rows map[string]*CacheRow
}

func newInMemCacheStore() *inMemCacheStore {
	return &inMemCacheStore{rows: make(map[string]*CacheRow)}
}

// inMemKey is the string key used for the rows map. We mirror the
// canonicalisation OutputCacheRepo applies on the SQL side (UTC midnight
// for operational_date) so two callers passing different times of day on
// the same operational day collapse to one row.
func inMemKey(reportID ReportID, hash string, opDate time.Time) string {
	return fmt.Sprintf("%s|%s|%s", reportID, hash, normalizeDate(opDate).Format("2006-01-02"))
}

func (s *inMemCacheStore) Get(ctx context.Context, reportID ReportID, hash string, opDate time.Time) (*CacheRow, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	row, ok := s.rows[inMemKey(reportID, hash, opDate)]
	if !ok {
		return nil, nil
	}
	// Deep copy the fields callers might inspect so the test never hands
	// the orchestrator a pointer aliased with the store's internal map.
	cp := *row
	if row.Payload != nil {
		p := *row.Payload
		cp.Payload = &p
	}
	if row.ComputingSince != nil {
		t := *row.ComputingSince
		cp.ComputingSince = &t
	}
	return &cp, nil
}

func (s *inMemCacheStore) UpsertComputing(ctx context.Context, key CacheKey, computingSince time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	k := inMemKey(key.ReportID, key.FilterHash, key.OperationalDate)
	cs := computingSince.UTC()
	if existing, ok := s.rows[k]; ok {
		// Preserve any existing payload — UpsertComputing on the
		// production repo intentionally leaves payload bytes alone
		// so concurrent SmartLoad polls can still observe the prior
		// value while the recompute runs.
		existing.Status = CacheStatusComputing
		existing.ComputingSince = &cs
		return nil
	}
	s.rows[k] = &CacheRow{
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

func (s *inMemCacheStore) UpsertValid(ctx context.Context, key CacheKey, payload Payload, inputVersion int64, computedAt time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	k := inMemKey(key.ReportID, key.FilterHash, key.OperationalDate)
	p := payload
	s.rows[k] = &CacheRow{
		Key: CacheKey{
			ReportID:        key.ReportID,
			FilterHash:      key.FilterHash,
			OperationalDate: normalizeDate(key.OperationalDate),
		},
		Payload:        &p,
		InputVersion:   inputVersion,
		Status:         CacheStatusValid,
		ComputedAt:     computedAt.UTC(),
		ComputingSince: nil,
		ErrorReason:    "",
	}
	return nil
}

func (s *inMemCacheStore) RestorePriorStatus(ctx context.Context, key CacheKey, priorStatus CacheStatus) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	k := inMemKey(key.ReportID, key.FilterHash, key.OperationalDate)
	existing, ok := s.rows[k]
	if !ok {
		return nil
	}
	existing.Status = priorStatus
	existing.ComputingSince = nil
	return nil
}

// -----------------------------------------------------------------------------
// Instrumented DataSource
// -----------------------------------------------------------------------------

// instrumentedDataSource is the unit-under-test target. Compute atomically
// bumps a call counter and sleeps for `computeSleep` so the singleflight
// window stays wide enough that every N goroutine released by the barrier
// has joined the same in-flight entry before the leader's function returns.
//
// The returned Payload is fixed: tests assert every caller receives this
// exact payload, with GeneratedAt and InputVersion as the discriminator
// fields (rows / totals / header are byte-equal but only the timestamps
// uniquely identify a single Compute invocation).
type instrumentedDataSource struct {
	computeCalls atomic.Int64
	versionCalls atomic.Int64
	computeSleep time.Duration
	fixedPayload Payload
}

var _ DataSource = (*instrumentedDataSource)(nil)

func (d *instrumentedDataSource) Compute(ctx context.Context, _ FilterPayload, _ *BoundedWorkerPool) (Payload, error) {
	d.computeCalls.Add(1)
	select {
	case <-time.After(d.computeSleep):
	case <-ctx.Done():
		return Payload{}, ctx.Err()
	}
	// Return a copy so each waiter that decodes the singleflight result
	// observes byte-equal but logically independent payload structs.
	return d.fixedPayload, nil
}

func (d *instrumentedDataSource) InputVersion(_ context.Context, _ FilterPayload) (int64, error) {
	d.versionCalls.Add(1)
	return d.fixedPayload.InputVersion, nil
}

// -----------------------------------------------------------------------------
// Property
// -----------------------------------------------------------------------------

// TestConcurrentRecomputeCoalescence is Property 7 from the
// master-consolidated-reporting spec — concurrent recompute coalescence.
//
// Validates: Requirements 6.6, 7.8, 12.4.
func TestConcurrentRecomputeCoalescence(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		n := rapid.IntRange(2, 32).Draw(rt, "n")
		// actions[i] == true → caller i invokes SmartLoad.Load.
		// actions[i] == false → caller i invokes ForceRecalculator.Recalculate.
		// rapid samples uniformly so mixed batches are common; the
		// homogeneous draws (all-Load, all-Recalc) also exercise the
		// invariant from the same key entry path.
		actions := rapid.SliceOfN(rapid.Bool(), n, n).Draw(rt, "actions")

		// Fixed DataSource payload. GeneratedAt and InputVersion are
		// the discriminators every caller's returned payload must
		// match — they are unique enough that an empty / zero-value
		// return immediately surfaces.
		fixedGenAt := time.Date(2025, 1, 1, 8, 30, 0, 0, time.UTC)
		fixedInputVer := int64(1_700_000_000_123)
		fixedPayload := Payload{
			Rows: []map[string]any{
				{"zone": "HMZ", "vehicle": "TN-01-AB-1234", "scans": 42},
			},
			Totals:       map[string]any{"scans": 42},
			Header:       map[string]any{"report": "concurrent-coalescence"},
			GeneratedAt:  fixedGenAt,
			InputVersion: fixedInputVer,
		}

		ds := &instrumentedDataSource{
			computeSleep: 20 * time.Millisecond,
			fixedPayload: fixedPayload,
		}

		reportID := ReportID("road_sweeping")
		def := &ReportDefinition{
			ID:            reportID,
			Name:          "Road Sweeping",
			Category:      CategoryRoadSweeping,
			Filters:       []FilterControl{{Key: FilterDate, Required: true}},
			PermissionKey: "reports.road_sweeping.view",
			DataSource:    ds,
		}
		catalog := NewCatalog()
		catalog.MustRegister(def)

		cache := newInMemCacheStore()
		pool := NewBoundedWorkerPool()
		defer pool.Stop()

		// Two orchestrators share one singleflight.Group — the shared
		// pointer is the entire mechanism Req 7.8 depends on. The
		// loader allocates the group; ForceRecalculator picks it up
		// through loader.Group().
		loader := NewSmartLoader(catalog, cache, pool, nil)
		recalc := NewForceRecalculator(catalog, cache, pool, loader.Group())

		// Historical date — TTL is 24h, far longer than any concurrent
		// burst, so the late-arriver cache-hit path is structurally
		// reachable but unlikely to fire inside the 20ms Compute
		// window. We still tolerate it in the assertions below: a
		// PathCacheHit return after the leader's UpsertValid is also
		// "every caller observes the same payload".
		opDate := time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC)
		// A 64-char lowercase-hex string is what FilterHash produces;
		// SmartLoader / ForceRecalculator do not re-validate the
		// format, but using a realistic value keeps the test honest
		// against any future format check.
		filterHash := "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
		filters := FilterPayload{FilterDate: opDate}

		type callResult struct {
			payload Payload
			path    string
			err     error
		}
		results := make([]callResult, n)

		// Barrier so the N goroutines all hit group.Do as close to
		// simultaneously as the runtime allows. Without it the first
		// caller would routinely finish its 20ms Compute before later
		// goroutines were even scheduled, defeating the coalescence
		// the property is supposed to exercise.
		gate := make(chan struct{})
		var wg sync.WaitGroup
		wg.Add(n)
		for i := 0; i < n; i++ {
			i := i
			go func() {
				defer wg.Done()
				<-gate
				var p Payload
				var path string
				var err error
				if actions[i] {
					p, path, err = loader.Load(context.Background(), reportID, filterHash, opDate, filters)
				} else {
					p, path, err = recalc.Recalculate(context.Background(), reportID, filterHash, opDate, filters)
				}
				results[i] = callResult{payload: p, path: path, err: err}
			}()
		}
		close(gate)
		wg.Wait()

		// ---------------------------------------------------------------
		// Assertion 1 — Compute called exactly once.
		//
		// Singleflight coalescence collapses N concurrent same-key
		// callers onto one execution of the wrapped function. The
		// wrapped function (doLoad / runRecompute) is the only path
		// that invokes ds.Compute, so the atomic counter must read 1
		// at the end of the iteration.
		// ---------------------------------------------------------------
		gotCalls := ds.computeCalls.Load()
		if gotCalls != 1 {
			rt.Fatalf(
				"DataSource.Compute invoked %d times across %d concurrent same-key requests (actions=%v); want exactly 1 (Req 6.6, 7.8, 12.4)",
				gotCalls, n, actions,
			)
		}

		// ---------------------------------------------------------------
		// Assertion 2 — every caller observes the same final payload.
		//
		// Both leaders (SmartLoader and ForceRecalculator) commit the
		// same fixedPayload via UpsertValid, so every coalesced
		// waiter must surface a payload whose GeneratedAt and
		// InputVersion match the DataSource's fixed values exactly.
		// Empty / zero-value returns indicate the waiter received a
		// result it could not decode (a real bug surfaced by this
		// property — see Property 7 / Req 7.8).
		// ---------------------------------------------------------------
		for i, r := range results {
			caller := "SmartLoad.Load"
			if !actions[i] {
				caller = "ForceRecalculator.Recalculate"
			}
			if r.err != nil {
				rt.Fatalf(
					"caller %d (%s) returned error: %v (no error expected on coalesced fresh recompute; actions=%v)",
					i, caller, r.err, actions,
				)
			}
			if !r.payload.GeneratedAt.Equal(fixedGenAt) {
				rt.Fatalf(
					"caller %d (%s) returned payload.GeneratedAt=%v, want %v (coalescence broken — caller did not receive the shared Compute result; actions=%v, path=%q)",
					i, caller, r.payload.GeneratedAt, fixedGenAt, actions, r.path,
				)
			}
			if r.payload.InputVersion != fixedInputVer {
				rt.Fatalf(
					"caller %d (%s) returned payload.InputVersion=%d, want %d (actions=%v, path=%q)",
					i, caller, r.payload.InputVersion, fixedInputVer, actions, r.path,
				)
			}
			if len(r.payload.Rows) != len(fixedPayload.Rows) {
				rt.Fatalf(
					"caller %d (%s) returned %d rows, want %d (actions=%v, path=%q)",
					i, caller, len(r.payload.Rows), len(fixedPayload.Rows), actions, r.path,
				)
			}
			if r.path == "" {
				rt.Fatalf(
					"caller %d (%s) returned empty path; expected one of {%q, %q, %q} (actions=%v)",
					i, caller, PathCacheHit, PathRecomputed, PathForceRecomputed, actions,
				)
			}
			// The path must be one of the three valid success
			// outcomes for this scenario:
			//   - recomputed       (SmartLoader leader)
			//   - force_recomputed (ForceRecalculator leader)
			//   - cache_hit        (a SmartLoader caller that
			//                       arrived after the leader's
			//                       UpsertValid landed — rare in
			//                       this test but structurally
			//                       legal)
			switch r.path {
			case PathCacheHit, PathRecomputed, PathForceRecomputed:
				// ok
			default:
				rt.Fatalf(
					"caller %d (%s) returned path=%q; want one of {%q, %q, %q} (actions=%v)",
					i, caller, r.path, PathCacheHit, PathRecomputed, PathForceRecomputed, actions,
				)
			}
		}
	})
}
