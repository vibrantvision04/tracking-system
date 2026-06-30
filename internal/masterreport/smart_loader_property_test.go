package masterreport

// smart_loader_property_test.go — task 10.2 (Property 6).
//
// Property 6: Smart_Load Recompute Trigger and Idempotence.
//
// For any cache state C drawn from the closed set
//
//	{absent, valid-fresh, valid-expired, stale, computing-fresh,
//	 computing-stale, error}
//
// for a key K = (report_id, filter_hash, operational_date):
//
//  1. SmartLoad(K) invokes DataSource.Compute iff
//     C ∈ {absent, valid-expired, stale, computing-stale, error}.
//  2. For C = valid-fresh, two consecutive SmartLoad(K) calls return
//     byte-equal payloads, the second call invokes Compute zero times,
//     and the second call's path is cache_hit.
//  3. The response field `path` equals "cache_hit" iff Compute was not
//     invoked locally, and "recomputed" iff it was.
//  4. Live-day TTL is 60s; historical TTL is 24h. Both constants are
//     asserted up front so a future refactor that changes them away
//     from the spec values fails fast.
//
// The fakeCacheStore in-memory implementation, the cacheStore compile-
// time assertion, and payloadsEqual all live in
// force_recalculate_property_test.go (task 11.2) — those helpers are
// reused here so the two property tests stay aligned on cache semantics
// (JSONB round-trip, key normalisation, UTC stamping).
//
// State seeding goes through the same UpsertValid / UpsertComputing /
// RestorePriorStatus methods SmartLoader and ForceRecalculator use in
// production, so every seeded state matches a real cache row shape.
//
// For computing-fresh the test schedules a sibling-process UpsertValid
// via time.AfterFunc 100ms after Load begins so pollUntilValid observes
// status='valid' on its first tick (250ms). Without the sibling write
// the call would block the full 30s PollDeadline.
//
// Validates: Requirements 6.2, 6.3, 6.4, 6.5

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"golang.org/x/sync/singleflight"
	"pgregory.net/rapid"
)

// -----------------------------------------------------------------------------
// State enumeration
// -----------------------------------------------------------------------------

// smartCacheState names one of the seven seeded cache states the property
// test draws from. The value space is closed and matches Property 6's
// state enumeration exactly.
type smartCacheState string

const (
	stateAbsent         smartCacheState = "absent"
	stateValidFresh     smartCacheState = "valid-fresh"
	stateValidExpired   smartCacheState = "valid-expired"
	stateStale          smartCacheState = "stale"
	stateComputingFresh smartCacheState = "computing-fresh"
	stateComputingStale smartCacheState = "computing-stale"
	stateError          smartCacheState = "error"
)

// allSmartCacheStates lists the closed state space rapid samples from.
func allSmartCacheStates() []smartCacheState {
	return []smartCacheState{
		stateAbsent,
		stateValidFresh,
		stateValidExpired,
		stateStale,
		stateComputingFresh,
		stateComputingStale,
		stateError,
	}
}

// expectsCompute reports whether SmartLoader.Load must invoke
// DataSource.Compute when the seeded cache holds the given state. The
// classification is the literal text of Property 6: Compute invoked iff
// C ∈ {absent, valid-expired, stale, computing-stale, error}.
func expectsCompute(s smartCacheState) bool {
	switch s {
	case stateAbsent, stateValidExpired, stateStale, stateComputingStale, stateError:
		return true
	case stateValidFresh, stateComputingFresh:
		return false
	}
	return false
}

// -----------------------------------------------------------------------------
// countingDataSource — DataSource that counts Compute invocations
// -----------------------------------------------------------------------------

// countingDataSource is the property-6-specific DataSource: it returns a
// fixed payload tagged with Header["source"]="compute" and increments an
// atomic counter on every Compute call. The tag lets the test
// distinguish a freshly-computed payload from a cache-hit payload (which
// carries Header["source"]="cached") and from a sibling-process payload
// (Header["source"]="sibling") without inspecting the count alone.
//
// recordingDataSource in force_recalculate_property_test.go is reserved
// for that test's call-index tracking; introducing a distinct
// countingDataSource here keeps the two tests' expectations independent.
type countingDataSource struct {
	calls int64
}

func (d *countingDataSource) Compute(_ context.Context, _ FilterPayload, _ *BoundedWorkerPool) (Payload, error) {
	atomic.AddInt64(&d.calls, 1)
	return Payload{
		Rows:         []map[string]any{{"col": "fresh-from-compute"}},
		Header:       map[string]any{"source": "compute"},
		InputVersion: 77,
		GeneratedAt:  time.Now().UTC(),
	}, nil
}

func (d *countingDataSource) InputVersion(_ context.Context, _ FilterPayload) (int64, error) {
	return 77, nil
}

func (d *countingDataSource) count() int64 { return atomic.LoadInt64(&d.calls) }

// -----------------------------------------------------------------------------
// Test helper: SmartLoader construction with injected cacheStore + clock
// -----------------------------------------------------------------------------

// newSmartLoaderWithStore builds a SmartLoader wired to the supplied
// cacheStore and a deterministic now() function. The production
// NewSmartLoader takes a cacheStore-satisfying argument as well (so
// *OutputCacheRepo flows through unchanged), but it always sets
// s.now = time.Now; this helper exposes the now seam the production
// constructor hides so TTL transitions can be driven without sleeping.
//
// Required dependencies (catalog, cache, pool) must be non-nil; group
// may be nil in which case a fresh *singleflight.Group is allocated per
// trial.
func newSmartLoaderWithStore(catalog *Catalog, cache cacheStore, pool *BoundedWorkerPool, group *singleflight.Group, now func() time.Time) *SmartLoader {
	if group == nil {
		group = &singleflight.Group{}
	}
	if now == nil {
		now = time.Now
	}
	return &SmartLoader{
		catalog: catalog,
		cache:   cache,
		pool:    pool,
		group:   group,
		now:     now,
	}
}

// -----------------------------------------------------------------------------
// TestSmartLoadTriggerAndIdempotence — Property 6
// -----------------------------------------------------------------------------

// TestSmartLoadTriggerAndIdempotence is Property 6 from the
// master-consolidated-reporting spec.
//
// Validates: Requirements 6.2, 6.3, 6.4, 6.5
func TestSmartLoadTriggerAndIdempotence(t *testing.T) {
	// TTL constants pinned to the spec text. A future refactor that
	// changes these values away from 60s / 24h breaks Req 6.2 / 6.4
	// regardless of any other behaviour, so we anchor them up front.
	if LiveDayTTL != 60*time.Second {
		t.Fatalf("LiveDayTTL = %s, expected 60s per Req 6.4", LiveDayTTL)
	}
	if HistoricalTTL != 24*time.Hour {
		t.Fatalf("HistoricalTTL = %s, expected 24h per Req 6.2", HistoricalTTL)
	}

	// A single shared pool — no countingDataSource ever submits work
	// to it, so reuse across trials is harmless and avoids per-trial
	// channel allocation.
	pool := NewBoundedWorkerPool()
	t.Cleanup(pool.Stop)

	const reportID ReportID = "smartload_property_test"
	const filterHash = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"

	rapid.Check(t, func(rt *rapid.T) {
		state := rapid.SampledFrom(allSmartCacheStates()).Draw(rt, "state")
		liveDay := rapid.Bool().Draw(rt, "live_day")

		// Freeze "now" at 12:00 UTC on a known day. With the default
		// 4h cutoff (DefaultOperationalCutoff), shift.OperationalDate
		// resolves to 2024-06-15 midnight UTC — which is also today's
		// calendar date — so liveDay==true picks opDate = today and
		// SmartLoader.ttlForOpDate selects LiveDayTTL.
		nowFrozen := time.Date(2024, 6, 15, 12, 0, 0, 0, time.UTC)
		now := func() time.Time { return nowFrozen }

		today := time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC)
		yesterday := today.AddDate(0, 0, -1)

		var opDate time.Time
		var ttl time.Duration
		if liveDay {
			opDate = today
			ttl = LiveDayTTL
		} else {
			opDate = yesterday
			ttl = HistoricalTTL
		}

		// freshAge strictly inside TTL; expiredAge strictly outside.
		// +1s rather than +1ns keeps the assertion robust under
		// monotonic-clock quantisation on platforms where time.Now
		// resolves to 100ns ticks.
		freshAge := ttl / 2
		expiredAge := ttl + time.Second

		// Fresh catalog and DataSource per trial so the Compute
		// counter is isolated from other trials. rapid's minimisation
		// re-runs the property body from scratch on each shrink step,
		// so per-trial state must be fully owned by the closure.
		catalog := NewCatalog()
		ds := &countingDataSource{}
		catalog.MustRegister(&ReportDefinition{
			ID:            reportID,
			Name:          "Smart Load Property Test",
			Category:      CategoryConsolidated,
			PermissionKey: "reports.smartload_property_test.view",
			DataSource:    ds,
		})

		store := newFakeCacheStore()
		ctx := context.Background()

		key := CacheKey{ReportID: reportID, FilterHash: filterHash, OperationalDate: opDate}

		// The seeded payload differs from the DataSource's payload so
		// the cache-hit assertion can verify the loader returned the
		// CACHED value (not freshly computed) by inspecting Header.
		seededPayload := Payload{
			Rows:         []map[string]any{{"col": "cached-from-seed"}},
			Header:       map[string]any{"source": "cached"},
			InputVersion: 1,
			GeneratedAt:  nowFrozen.Add(-freshAge),
		}

		switch state {
		case stateAbsent:
			// No row inserted; SmartLoader's Get returns (nil, nil).

		case stateValidFresh:
			// UpsertValid stamps the row in status='valid' with the
			// supplied computedAt. computedAt - now < TTL → fresh.
			if err := store.UpsertValid(ctx, key, seededPayload, 1, nowFrozen.Add(-freshAge)); err != nil {
				rt.Fatalf("seed valid-fresh: %v", err)
			}

		case stateValidExpired:
			if err := store.UpsertValid(ctx, key, seededPayload, 1, nowFrozen.Add(-expiredAge)); err != nil {
				rt.Fatalf("seed valid-expired: %v", err)
			}

		case stateStale:
			// Reach 'stale' through the same UpsertValid +
			// RestorePriorStatus path the production rollback uses.
			if err := store.UpsertValid(ctx, key, seededPayload, 1, nowFrozen.Add(-freshAge)); err != nil {
				rt.Fatalf("seed stale (upsert): %v", err)
			}
			if err := store.RestorePriorStatus(ctx, key, CacheStatusStale); err != nil {
				rt.Fatalf("seed stale (restore): %v", err)
			}

		case stateComputingFresh:
			// computing_since < ComputingStaleAfter (5min): SmartLoad
			// must wait on the sibling, not start a fresh recompute.
			if err := store.UpsertComputing(ctx, key, nowFrozen.Add(-30*time.Second)); err != nil {
				rt.Fatalf("seed computing-fresh: %v", err)
			}

		case stateComputingStale:
			// computing_since > ComputingStaleAfter: SmartLoad must
			// take over with a fresh recompute.
			if err := store.UpsertComputing(ctx, key, nowFrozen.Add(-10*time.Minute)); err != nil {
				rt.Fatalf("seed computing-stale: %v", err)
			}

		case stateError:
			if err := store.UpsertValid(ctx, key, seededPayload, 1, nowFrozen.Add(-freshAge)); err != nil {
				rt.Fatalf("seed error (upsert): %v", err)
			}
			if err := store.RestorePriorStatus(ctx, key, CacheStatusError); err != nil {
				rt.Fatalf("seed error (restore): %v", err)
			}
		}

		// computing-fresh requires a sibling-process UpsertValid to
		// land before the 30s PollDeadline; without it the trial
		// would block the full 30s and rapid would exceed any sane
		// per-trial budget. The sibling payload is distinct from
		// both the seeded one and the DataSource's so the assertion
		// can verify the loader returned the SIBLING's payload.
		siblingPayload := Payload{
			Rows:         []map[string]any{{"col": "sibling-completed"}},
			Header:       map[string]any{"source": "sibling"},
			InputVersion: 999,
			GeneratedAt:  nowFrozen,
		}
		if state == stateComputingFresh {
			// 100ms is well inside the 250ms first poll tick, so
			// the sibling write lands before SmartLoader's first
			// re-read. AfterFunc schedules on the runtime timer
			// goroutine so this does not occupy a test goroutine.
			time.AfterFunc(100*time.Millisecond, func() {
				_ = store.UpsertValid(context.Background(), key, siblingPayload, 999, nowFrozen)
			})
		}

		loader := newSmartLoaderWithStore(catalog, store, pool, &singleflight.Group{}, now)

		// 5s timeout: every state except computing-fresh completes
		// synchronously; computing-fresh polls for at most 250ms
		// after the sibling lands. Five seconds is two orders of
		// magnitude above the worst case and forgives test-host
		// scheduler jitter.
		loadCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		payload, path, err := loader.Load(loadCtx, reportID, filterHash, opDate, FilterPayload{})
		if err != nil {
			rt.Fatalf("state=%q liveDay=%v: Load returned error: %v", state, liveDay, err)
		}

		// Property A: Compute invoked iff state ∈ trigger set.
		gotCalls := ds.count()
		wantCompute := expectsCompute(state)
		switch {
		case wantCompute && gotCalls != 1:
			rt.Fatalf("state=%q liveDay=%v: expected exactly 1 Compute invocation, got %d", state, liveDay, gotCalls)
		case !wantCompute && gotCalls != 0:
			rt.Fatalf("state=%q liveDay=%v: expected 0 Compute invocations, got %d", state, liveDay, gotCalls)
		}

		// Property C: path equals cache_hit iff Compute not invoked
		// locally; recomputed iff it was. The classification reflects
		// SmartLoader's local invocation count, matching the literal
		// text of Property 6.
		wantPath := PathRecomputed
		if !wantCompute {
			wantPath = PathCacheHit
		}
		if path != wantPath {
			rt.Fatalf("state=%q liveDay=%v: expected path=%q (compute=%v), got path=%q",
				state, liveDay, wantPath, wantCompute, path)
		}

		// Sanity: payload must be non-empty regardless of state.
		if len(payload.Rows) == 0 {
			rt.Fatalf("state=%q liveDay=%v: Load returned empty payload Rows", state, liveDay)
		}

		// Source verification — Header["source"] tags which payload
		// travelled through the loader:
		//
		//   - "compute" → countingDataSource (Compute invoked)
		//   - "cached"  → cache-seeded payload (cache hit)
		//   - "sibling" → sibling-process UpsertValid payload
		//                 (computing-fresh poll observed valid)
		//
		// This catches accidental swaps a path-only check would
		// miss — e.g. a recompute path that mistakenly returns the
		// seeded value, or a cache hit that returns the DataSource
		// payload.
		gotSource, _ := payload.Header["source"].(string)
		switch state {
		case stateValidFresh:
			if gotSource != "cached" {
				rt.Fatalf("state=valid-fresh liveDay=%v: expected payload source=cached, got %q", liveDay, gotSource)
			}
		case stateComputingFresh:
			if gotSource != "sibling" {
				rt.Fatalf("state=computing-fresh liveDay=%v: expected payload source=sibling, got %q", liveDay, gotSource)
			}
		default:
			if gotSource != "compute" {
				rt.Fatalf("state=%q liveDay=%v: expected payload source=compute, got %q", state, liveDay, gotSource)
			}
		}

		// Property B: idempotence on valid-fresh — two consecutive
		// Load calls return byte-equal payloads, the second call's
		// Compute count stays at 0, and the second call's path is
		// cache_hit.
		if state == stateValidFresh {
			payload2, path2, err2 := loader.Load(loadCtx, reportID, filterHash, opDate, FilterPayload{})
			if err2 != nil {
				rt.Fatalf("valid-fresh idempotence: second Load returned error: %v", err2)
			}
			if path2 != PathCacheHit {
				rt.Fatalf("valid-fresh idempotence: second Load path=%q, want %q", path2, PathCacheHit)
			}
			if ds.count() != gotCalls {
				rt.Fatalf("valid-fresh idempotence: Compute count grew on second Load: before=%d after=%d", gotCalls, ds.count())
			}
			if ok, want, got := payloadsEqual(payload, payload2); !ok {
				rt.Fatalf("valid-fresh idempotence: payloads differ across consecutive Load calls\nfirst:  %s\nsecond: %s", want, got)
			}
		}
	})
}
