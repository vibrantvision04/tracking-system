// Package masterreport contains the Master Consolidated Reporting Module.
//
// This file implements ForceRecalculator — the explicit-user-action escape
// hatch that bypasses the Output_Cache read side, recomputes the report
// from raw GPS/attendance/RFID/weighbridge data, and overwrites the cached
// payload (Req 7). The HTTP handler that wires `POST
// /api/master-reports/{report_id}/recalculate` (task 15.1) checks the
// `reports.force_recalculate` admin permission before invoking Recalculate;
// this layer never re-checks permissions.
//
// Coalescence model: ForceRecalculator and SmartLoader (task 10.1) share a
// single `*singleflight.Group` keyed by `(report_id, filter_hash,
// operational_date)`. The shared group satisfies Req 7.8 — when a
// SmartLoad recompute is already in flight, a concurrent ForceRecalculate
// for the same key piggybacks on that compute instead of launching a
// parallel raw-data refetch, and vice versa. Cross-process coalescence (a
// second app instance) is provided by the OutputCacheRepo's `computing`
// status flag, which is read by SmartLoader's poll loop; ForceRecalculator
// intentionally does NOT poll — its contract is to overwrite the cache
// regardless of prior state.
//
// Failure handling: a failed Compute call MUST leave the prior payload
// untouched and roll the row status back to its pre-recompute value
// (Req 6.7, 7.6, 12.7). UpsertComputing only updates the status /
// computing_since columns (see output_cache_repo.go), so the payload bytes
// are preserved across the in-flight window; RestorePriorStatus then flips
// status back via the shared priorStatusForRollback mapping.
//
// Path, error, and singleflight-key symbols live in recompute_common.go so
// SmartLoader and ForceRecalculator agree on them by construction.
//
// Requirements covered: 7.3, 7.6, 7.7, 7.8, 12.1.
package masterreport

import (
	"context"
	"fmt"
	"time"

	"golang.org/x/sync/singleflight"
)

// -----------------------------------------------------------------------------
// ForceRecalculator
// -----------------------------------------------------------------------------

// ForceRecalculator orchestrates explicit force-recompute requests. A
// single instance is constructed at module boot and injected into the HTTP
// handler that serves `POST /api/master-reports/{report_id}/recalculate`.
//
// The struct is safe for concurrent use; every method takes the caller's
// context and routes any in-process coalescence through the shared
// singleflight group.
type ForceRecalculator struct {
	// catalog resolves a ReportID to its bound DataSource. The catalog is
	// immutable post-boot (registry.go) so lookups are read-only.
	catalog *Catalog

	// cache is the report_output_cache accessor. ForceRecalculator uses
	// only Get (to remember prior status for rollback), UpsertComputing,
	// UpsertValid, and RestorePriorStatus — never the read-side cache-hit
	// paths owned by SmartLoader.
	cache cacheStore

	// pool is the shared BoundedWorkerPool passed to DataSource.Compute so
	// per-vehicle / per-zone / per-ward fan-out stays inside the
	// module-wide 12-slot concurrency cap.
	pool *BoundedWorkerPool

	// group is the singleflight group shared with SmartLoader. The two
	// orchestrators MUST hold the same *singleflight.Group pointer so
	// concurrent SmartLoad and ForceRecalc requests for the same key
	// coalesce onto one DataSource.Compute (Req 7.8, Property 7).
	// NewForceRecalculator allocates a fresh group when the caller
	// passes nil — useful only for isolated unit tests.
	group *singleflight.Group

	// now is the time source. Pulled out so tests can freeze it; production
	// wiring sets this to time.Now.
	now func() time.Time
}

// NewForceRecalculator constructs a ForceRecalculator. Required dependencies:
//
//   - catalog: the registered ReportDefinition catalog (cmd/server/main.go
//     populates this at boot).
//   - cache:   the OutputCacheRepo backed by the application pgxpool.
//   - pool:    the shared BoundedWorkerPool (one instance per process).
//   - group:   the *singleflight.Group SmartLoader also holds. Pass the
//     value returned by SmartLoader.Group() here so cross-action
//     coalescence (Req 7.8) actually works. A nil group falls back to a
//     private instance — appropriate only for isolated unit tests.
//
// Required dependencies (catalog, cache, pool) are stored as-is; passing
// nil for any of them panics, mirroring NewSmartLoader so the
// misconfiguration surfaces at boot rather than as a nil-deref on the
// first request.
func NewForceRecalculator(catalog *Catalog, cache cacheStore, pool *BoundedWorkerPool, group *singleflight.Group) *ForceRecalculator {
	if catalog == nil {
		panic("masterreport: NewForceRecalculator requires a non-nil *Catalog")
	}
	if cache == nil {
		panic("masterreport: NewForceRecalculator requires a non-nil cache store")
	}
	if pool == nil {
		panic("masterreport: NewForceRecalculator requires a non-nil *BoundedWorkerPool")
	}
	if group == nil {
		group = &singleflight.Group{}
	}
	return &ForceRecalculator{
		catalog: catalog,
		cache:   cache,
		pool:    pool,
		group:   group,
		now:     time.Now,
	}
}

// The singleflight payload returned by runRecompute is the shared
// recomputeResult declared in recompute_common.go. SmartLoader and
// ForceRecalculator MUST use the SAME wrapper struct type because they
// share one *singleflight.Group (Req 7.8). When a SmartLoad and a
// ForceRecalc race the same key, only one of them runs the wrapped
// function and every other caller decodes the leader's value through a
// type assertion. If the two orchestrators used different private wrapper
// types, the follower's assertion against the leader's struct would fail
// silently and yield a zero-value wrapper — surfacing as an empty Payload
// with an empty path. That is exactly the failure mode Property 7's
// TestConcurrentRecomputeCoalescence is designed to catch.

// Recalculate performs a force recompute for the supplied
// (reportID, filterHash, opDate) key. The contract:
//
//  1. The cache is BYPASSED on the read side — there is no cache-hit path
//     here. Even a `valid` row with a fresh `computed_at` is overwritten.
//  2. The row is flipped to status='computing' before Compute runs.
//     UpsertComputing preserves any existing payload bytes, so concurrent
//     SmartLoad polls observing the in-flight row still see the prior
//     value until our recompute lands.
//  3. DataSource.Compute is called with the supplied filters and the
//     shared BoundedWorkerPool. Implementations refetch from raw
//     GPS/attendance/RFID/weighbridge tables — they do not consult any
//     intermediate cache layer.
//  4. On success: UpsertValid overwrites the payload, stamps computed_at
//     = now, clears error_reason and computing_since, and the call
//     returns (payload, "force_recomputed", nil) (Req 7.7).
//  5. On failure: RestorePriorStatus rolls the row back to whatever
//     status it held before step 2 (the prior payload was never
//     overwritten), and the call returns (zero Payload,
//     "recompute_failed", wrapped err) (Req 6.7, 7.6, 12.7).
//
// Concurrent same-key Recalculate or SmartLoad requests are coalesced
// through the shared singleflight group (Req 7.8). The first caller runs
// the full sequence above; every other caller blocks on `group.Do` and
// receives a copy of the same (payload, path, err) tuple. Only the
// underlying runRecompute body is dedup'd by the singleflight; the
// catalog lookup happens per-caller because it is cheap and read-only.
//
// Validates: Req 7.3, 7.6, 7.7, 7.8, 12.1.
func (f *ForceRecalculator) Recalculate(ctx context.Context, reportID ReportID, filterHash string, opDate time.Time, filters FilterPayload) (Payload, string, error) {
	// Resolve the report definition outside the singleflight. A missing
	// report is a client error (404), not a recompute error; coalescing
	// the lookup would pin a stale ReportID to other callers needlessly.
	def, ok := f.catalog.Get(reportID)
	if !ok {
		return Payload{}, "", fmt.Errorf("%w: %s", ErrUnknownReportID, reportID)
	}

	// Singleflight key — must match SmartLoader's key derivation exactly
	// so the two callers actually share the in-flight entry. The opDate
	// is normalised to UTC midnight via the same Format string the
	// CacheKey uses internally, so two callers passing different times
	// of day on the same operational day collapse to one flight.
	sfKey := singleflightKey(reportID, filterHash, opDate)

	v, sfErr, _ := f.group.Do(sfKey, func() (interface{}, error) {
		payload, path, err := f.runRecompute(ctx, def, reportID, filterHash, opDate, filters)
		return recomputeResult{payload: payload, path: path}, err
	})

	// The closure always returns a recomputeResult value (even on error),
	// so the type assertion is safe. Sharing the wrapper struct with
	// SmartLoader (declared in recompute_common.go) is what makes
	// cross-action coalescence (Req 7.8 / Property 7) actually work: a
	// SmartLoad follower whose flight was led by a ForceRecalculate
	// decodes the leader's return value through the SAME struct
	// definition and surfaces the leader's payload + path verbatim.
	res, _ := v.(recomputeResult)
	return res.payload, res.path, sfErr
}

// runRecompute is the per-key body of Recalculate, executed inside the
// singleflight group. Split out so the singleflight wiring above stays
// readable and so tests can exercise the success / failure branches
// without paying the goroutine cost of singleflight's deduplication.
func (f *ForceRecalculator) runRecompute(ctx context.Context, def *ReportDefinition, reportID ReportID, filterHash string, opDate time.Time, filters FilterPayload) (Payload, string, error) {
	key := CacheKey{
		ReportID:        reportID,
		FilterHash:      filterHash,
		OperationalDate: opDate,
	}

	// Capture prior status so we can restore it on Compute failure
	// (Req 7.6). priorStatusForRollback (recompute_common.go) collapses
	// 'computing' to 'error' so we never hand a stuck row back to the
	// stale-computing branch.
	prior, err := f.cache.Get(ctx, reportID, filterHash, opDate)
	if err != nil {
		// A Get failure is not by itself a reason to abort the
		// recompute — we could still flip to computing and run
		// Compute. But the rollback would then lose the true prior
		// status, so we surface the error to the caller wrapped as
		// recompute_failed and leave the cache row untouched.
		return Payload{}, PathRecomputeFailed, fmt.Errorf("%w: read prior cache row: %v", ErrRecomputeFailed, err)
	}
	priorStatus := priorStatusForRollback(prior)

	now := f.now().UTC()

	// Flip to computing. UpsertComputing preserves any existing payload
	// bytes — concurrent SmartLoad polls continue to observe the prior
	// payload until our recompute lands or rolls back.
	if err := f.cache.UpsertComputing(ctx, key, now); err != nil {
		return Payload{}, PathRecomputeFailed, fmt.Errorf("%w: mark computing: %v", ErrRecomputeFailed, err)
	}

	// Raw refetch. DataSource.Compute is responsible for honoring ctx
	// cancellation at every blocking step and for routing fan-out
	// through the supplied pool. The masterreport layer enforces
	// permission and audit once at the HTTP boundary — adapters must
	// not duplicate either responsibility.
	payload, computeErr := def.DataSource.Compute(ctx, filters, f.pool)
	if computeErr != nil {
		// Roll the row back to its pre-recompute status. The prior
		// payload bytes were never touched by UpsertComputing, so they
		// remain available to subsequent SmartLoad callers. We use a
		// background-derived context for the rollback so a cancelled
		// caller ctx does not orphan the cache row in 'computing'
		// state; the OutputCacheRepo calls are bounded by their own
		// timeouts at the pool layer.
		restoreCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = f.cache.RestorePriorStatus(restoreCtx, key, priorStatus)
		return Payload{}, PathRecomputeFailed, fmt.Errorf("%w: %v", ErrRecomputeFailed, computeErr)
	}

	// Resolve input_version. As in SmartLoader, a missing or failing
	// InputVersion falls back to the wall clock so the cache row always
	// carries a strictly increasing value.
	inputVersion, ivErr := def.DataSource.InputVersion(ctx, filters)
	if ivErr != nil || inputVersion == 0 {
		inputVersion = f.now().UnixMilli()
	}

	// Fill in payload fields the DataSource left blank. Adapters are
	// free to populate GeneratedAt / InputVersion themselves; we only
	// supply defaults when they did not.
	completedAt := f.now().UTC()
	if payload.GeneratedAt.IsZero() {
		payload.GeneratedAt = completedAt
	}
	if payload.InputVersion == 0 {
		payload.InputVersion = inputVersion
	}

	// Success: overwrite the payload and flip status to valid. The
	// computed_at column gets `completedAt`, satisfying Req 7.7's
	// "include the new computed_at timestamp" clause.
	if err := f.cache.UpsertValid(ctx, key, payload, payload.InputVersion, completedAt); err != nil {
		// The recompute succeeded but the cache write failed. Roll
		// the row back so the next Load retries cleanly and surface
		// recompute_failed because the system state did not reach
		// the committed-valid terminal state the caller expects.
		_ = f.cache.RestorePriorStatus(ctx, key, priorStatus)
		return Payload{}, PathRecomputeFailed, fmt.Errorf("%w: upsert valid: %v", ErrRecomputeFailed, err)
	}

	return payload, PathForceRecomputed, nil
}
