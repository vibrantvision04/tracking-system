// Package masterreport contains the Master Consolidated Reporting Module.
//
// This file implements SmartLoader — the cache-aware orchestration layer
// that sits between the HTTP handlers and the DataSource adapters. It
// realises the Smart Load model documented in
// docs/reporting-architecture-redesign.md §11 and the spec design §16:
//
//	Load(ctx, reportID, filterHash, opDate, filters) →
//	  read report_output_cache
//	    │
//	    ├─ status=valid, computed_at within TTL → return cache_hit
//	    │
//	    ├─ status=computing, computing_since < 5min →
//	    │      poll the row every 250ms up to 30s,
//	    │      return the eventual payload (recomputed) or
//	    │      recompute_timeout
//	    │
//	    └─ absent / stale / expired / error / computing-stale →
//	           UpsertComputing → DataSource.Compute
//	             │
//	             ├─ ok    → UpsertValid → return recomputed
//	             └─ fail  → RestorePriorStatus → return recompute_failed
//
// Single-process coalescence is implemented with golang.org/x/sync/singleflight
// keyed by (report_id, filter_hash, operational_date) — every overlapping
// same-key call in the same process shares one Compute (Property 7). The
// group is shared with ForceRecalculator (see force_recalculate.go) so a
// concurrent Force-Recalc on the same key piggybacks on an in-flight
// SmartLoad recompute (Req 7.8). Cross-process coalescence is handled by
// the cache-row status field and the 5-minute computing window: two
// processes that both observe status='computing' with computing_since < 5min
// wait on the row by polling every 250ms.
//
// TTL determination is shift-aware. The live-day TTL is 60s when the
// supplied operational_date equals today's operational date (under the
// report's per-report cutoff, defaulting to 4h per
// shift.DefaultOperationalCutoff). Every other date is "historical" with a
// 24h TTL.
//
// Path, error, and singleflight-key symbols live in recompute_common.go so
// SmartLoader and ForceRecalculator agree on them by construction.
//
// Requirements covered: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 12.4.
package masterreport

import (
	"context"
	"fmt"
	"time"

	"golang.org/x/sync/singleflight"

	"gps-tracking-system/internal/shift"
)

// -----------------------------------------------------------------------------
// Tunable durations
// -----------------------------------------------------------------------------

// TTL and timing constants. Exposed (capitalised) so tests in task 10.2 can
// reference the same values the implementation does rather than hard-coding
// magic numbers in two places.
const (
	// LiveDayTTL is the cache freshness window for rows whose
	// operational_date equals today's operational date under the report's
	// cutoff (Req 6.2, 6.4).
	LiveDayTTL = 60 * time.Second

	// HistoricalTTL is the cache freshness window for every operational
	// date earlier than today (Req 6.2).
	HistoricalTTL = 24 * time.Hour

	// ComputingStaleAfter is the upper bound on how long a row may sit in
	// status='computing' before a fresh recompute is allowed to take over
	// (Req 6.3, 6.6). Rows older than this are treated the same as
	// absent/stale.
	ComputingStaleAfter = 5 * time.Minute

	// PollInterval is the cadence of cache-row re-reads while waiting on
	// a concurrent recompute (cross-process coalescence; Req 6.6).
	PollInterval = 250 * time.Millisecond

	// PollDeadline is the maximum time SmartLoader will wait on another
	// process's in-flight recompute before giving up with
	// recompute_timeout (Req 6.6, 6.7).
	PollDeadline = 30 * time.Second
)

// -----------------------------------------------------------------------------
// SmartLoader
// -----------------------------------------------------------------------------

// SmartLoader is the orchestrator that implements Req 6.1–6.7's Smart Load
// contract. A single instance is constructed at module boot and shared
// across every HTTP handler. The zero value is not usable; construct
// instances through NewSmartLoader.
//
// Concurrency model:
//
//   - `group` (*singleflight.Group) coalesces every same-key Load call
//     within the same process onto one Compute invocation (Property 7,
//     Req 6.6, 12.4). The group is owned by NewSmartLoader and shared
//     with ForceRecalculator so cross-action coalescence (Req 7.8) works.
//   - Cross-process coalescence is handled at the storage layer via the
//     cache row's status='computing' marker and the 5-minute computing
//     window; the poll loop (pollUntilValid) waits for the sibling
//     process's UpsertValid to land.
//   - The `now` function is configurable so tests can drive TTL and 5-minute
//     window transitions deterministically without sleeping. Production
//     code uses time.Now (set by NewSmartLoader).
type SmartLoader struct {
	catalog *Catalog
	cache   cacheStore
	pool    *BoundedWorkerPool

	// group is the singleflight group SmartLoader and ForceRecalculator
	// both route their per-key Compute coalescence through. Holding it
	// by pointer lets a single shared instance back both orchestrators,
	// which is what Req 7.8 / Property 7 demand. NewSmartLoader allocates
	// a fresh group when the caller passes nil so unit tests stay
	// concise; production wiring passes the shared instance returned by
	// SmartLoader.Group() (or constructed externally) into the matching
	// NewForceRecalculator call.
	group *singleflight.Group

	// now defaults to time.Now in NewSmartLoader. Test code in task 10.2
	// reassigns it to drive cache TTL transitions without real sleeps.
	now func() time.Time
}

// NewSmartLoader constructs a SmartLoader. catalog, cache, and pool must
// all be non-nil; nil values trip a panic so the misconfiguration surfaces
// at boot rather than as a nil-deref on the first request.
//
// `group` is the *singleflight.Group shared with ForceRecalculator. When
// nil, NewSmartLoader allocates a fresh group on this instance — useful
// for unit tests that exercise SmartLoader in isolation. Production wiring
// MUST pass a non-nil shared instance so Req 7.8 (Force-Recalc and
// SmartLoad coalesce for the same key) actually holds.
func NewSmartLoader(catalog *Catalog, cache cacheStore, pool *BoundedWorkerPool, group *singleflight.Group) *SmartLoader {
	if catalog == nil {
		panic("masterreport: NewSmartLoader requires a non-nil *Catalog")
	}
	if cache == nil {
		panic("masterreport: NewSmartLoader requires a non-nil cache store")
	}
	if pool == nil {
		panic("masterreport: NewSmartLoader requires a non-nil *BoundedWorkerPool")
	}
	if group == nil {
		group = &singleflight.Group{}
	}
	return &SmartLoader{
		catalog: catalog,
		cache:   cache,
		pool:    pool,
		group:   group,
		now:     time.Now,
	}
}

// Group returns the *singleflight.Group SmartLoader is using. Pass this
// into NewForceRecalculator so the two orchestrators share their in-flight
// coalescence (Req 7.8). The returned pointer is the live instance — do
// not copy or replace it after construction.
func (s *SmartLoader) Group() *singleflight.Group {
	return s.group
}

// SmartLoader's singleflight payload is the shared recomputeResult
// (declared in recompute_common.go) so a follower whose flight was led by
// ForceRecalculator decodes the leader's value through the same struct
// definition. See recomputeResult's doc comment for the bug this prevents.

// Load is the public entry point. It dispatches to doLoad through a
// singleflight.Group so concurrent same-key calls share one execution.
//
// Returns:
//   - (payload, "cache_hit", nil)      — cache hit within TTL, OR a
//                                        sibling-process recompute
//                                        observed via polling (local
//                                        Compute was not invoked). Per
//                                        Property 6 (design.md §16):
//                                        `path = cache_hit iff Compute
//                                        was not invoked`.
//   - (payload, "recomputed", nil)     — local DataSource.Compute was
//                                        invoked and succeeded.
//   - (Payload{}, "recompute_failed",
//     ErrRecomputeFailed | wrapped)   — recompute or cache I/O failed.
//   - (Payload{}, "recompute_timeout",
//     ErrRecomputeTimeout)             — polled a sibling-process recompute
//                                        beyond PollDeadline (30s).
//   - (Payload{}, "", ErrUnknownReportID) — reportID not in catalog.
//
// The path string is populated even on error so the HTTP layer can render
// the failure category without inspecting the err itself (the audit
// emitter in task 12.2 records both fields).
func (s *SmartLoader) Load(
	ctx context.Context,
	reportID ReportID,
	filterHash string,
	opDate time.Time,
	filters FilterPayload,
) (Payload, string, error) {
	def, ok := s.catalog.Get(reportID)
	if !ok {
		return Payload{}, "", fmt.Errorf("%w: %q", ErrUnknownReportID, reportID)
	}

	key := singleflightKey(reportID, filterHash, opDate)
	v, err, _ := s.group.Do(key, func() (interface{}, error) {
		res, e := s.doLoad(ctx, def, filterHash, opDate, filters)
		return res, e
	})

	// singleflight.Do may return (nil, err) only when fn returns a typed
	// nil value alongside an error. Our fn always returns a
	// recomputeResult value, so the type assertion below is safe; the
	// comma-ok form is belt-and-braces in case a future refactor changes
	// the return type.
	res, _ := v.(recomputeResult)
	return res.payload, res.path, err
}

// -----------------------------------------------------------------------------
// Internal: doLoad, recompute, poll loop
// -----------------------------------------------------------------------------

// doLoad executes the Smart Load decision tree against the current cache
// row. It is invoked through the singleflight.Group so within a single
// process at most one goroutine runs this function per key at any instant.
func (s *SmartLoader) doLoad(
	ctx context.Context,
	def *ReportDefinition,
	filterHash string,
	opDate time.Time,
	filters FilterPayload,
) (recomputeResult, error) {
	row, err := s.cache.Get(ctx, def.ID, filterHash, opDate)
	if err != nil {
		return recomputeResult{path: PathRecomputeFailed}, fmt.Errorf("%w: read cache: %v", ErrRecomputeFailed, err)
	}

	now := s.now().UTC()
	ttl := s.ttlForOpDate(def, opDate, now)

	if row != nil {
		switch row.Status {
		case CacheStatusValid:
			// Cache hit only when the payload is present AND
			// within the freshness window. A nil Payload here
			// would mean status='valid' was written without a
			// payload, which is structurally impossible given
			// UpsertValid always carries one — but we still
			// defend by falling through to recompute.
			if row.Payload != nil && now.Sub(row.ComputedAt.UTC()) < ttl {
				return recomputeResult{payload: *row.Payload, path: PathCacheHit}, nil
			}
			// status='valid' but expired → fall through to recompute.

		case CacheStatusComputing:
			// Another writer (this process's prior call, a
			// sibling process, or an abandoned recompute) holds
			// the row. If computing_since is fresh (<5min), wait
			// on it. Otherwise (stale or missing timestamp),
			// take over with a fresh recompute.
			if row.ComputingSince != nil && now.Sub(row.ComputingSince.UTC()) < ComputingStaleAfter {
				return s.pollUntilValid(ctx, def, filterHash, opDate)
			}
			// Stale computing → fall through to recompute.

		case CacheStatusStale, CacheStatusError:
			// Both states explicitly trigger a recompute per
			// Req 6.3.
		}
	}

	return s.recompute(ctx, def, filterHash, opDate, filters, row)
}

// ttlForOpDate returns LiveDayTTL when opDate equals today's operational
// date under the report's per-report cutoff, otherwise HistoricalTTL. The
// comparison is performed in UTC so callers in different zones can pass
// any time.Time on the operational day; only the calendar day component is
// significant.
func (s *SmartLoader) ttlForOpDate(def *ReportDefinition, opDate, now time.Time) time.Duration {
	today := shift.OperationalDate(now, def.EffectiveOperationalCutoff())
	// shift.OperationalDate returns midnight in now's location. Normalise
	// both sides to UTC midnight before comparing so a UTC-now and a
	// UTC-opDate compare equal.
	todayUTC := normalizeDate(today)
	opDateUTC := normalizeDate(opDate)
	if opDateUTC.Equal(todayUTC) {
		return LiveDayTTL
	}
	return HistoricalTTL
}

// recompute is the cache-miss / stale / expired / error path. It stamps
// status='computing' first, runs DataSource.Compute, then either commits
// the new payload (UpsertValid) or rolls the row back (RestorePriorStatus).
//
// The prior CacheRow is passed in (nil when no row existed before) so the
// rollback can target the right status. For an absent prior we roll forward
// to status='error' — the row exists now because UpsertComputing created
// it, and 'error' is the correct closed-loop state for a failed attempt
// that produced no payload (priorStatusForRollback in recompute_common.go).
func (s *SmartLoader) recompute(
	ctx context.Context,
	def *ReportDefinition,
	filterHash string,
	opDate time.Time,
	filters FilterPayload,
	prior *CacheRow,
) (recomputeResult, error) {
	key := CacheKey{
		ReportID:        def.ID,
		FilterHash:      filterHash,
		OperationalDate: opDate,
	}

	priorStatus := priorStatusForRollback(prior)

	startedAt := s.now().UTC()
	if err := s.cache.UpsertComputing(ctx, key, startedAt); err != nil {
		return recomputeResult{path: PathRecomputeFailed}, fmt.Errorf("%w: upsert computing: %v", ErrRecomputeFailed, err)
	}

	payload, computeErr := def.DataSource.Compute(ctx, filters, s.pool)
	if computeErr != nil {
		// Roll the row back so the prior payload remains accessible
		// and the next Load picks up where this one left off
		// (Req 6.7). RestorePriorStatus errors are not fatal: the
		// caller already has the compute error, so we surface the
		// compute error and tolerate a failed rollback (the row
		// would simply sit in 'computing' until the 5-minute stale
		// window elapses).
		_ = s.cache.RestorePriorStatus(ctx, key, priorStatus)
		return recomputeResult{path: PathRecomputeFailed}, fmt.Errorf("%w: %v", ErrRecomputeFailed, computeErr)
	}

	// Resolve input_version. The DataSource's InputVersion may fail or
	// be expensive; we tolerate failures by falling back to the wall
	// clock (degrades to "always advances", which leaves the wall-clock
	// TTL as the only freshness gate — acceptable per design §3.4).
	inputVersion, ivErr := def.DataSource.InputVersion(ctx, filters)
	if ivErr != nil || inputVersion == 0 {
		inputVersion = s.now().UnixMilli()
	}

	completedAt := s.now().UTC()
	// Fill in payload fields the DataSource left blank. Adapters are
	// free to populate GeneratedAt / InputVersion themselves; we only
	// supply defaults when they did not.
	if payload.GeneratedAt.IsZero() {
		payload.GeneratedAt = completedAt
	}
	if payload.InputVersion == 0 {
		payload.InputVersion = inputVersion
	}

	if err := s.cache.UpsertValid(ctx, key, payload, payload.InputVersion, completedAt); err != nil {
		// Cache write failed after a successful compute. Roll the
		// row back so the next Load retries cleanly. We still
		// surface recompute_failed because the system state did not
		// reach the committed-valid terminal state the caller
		// expects.
		_ = s.cache.RestorePriorStatus(ctx, key, priorStatus)
		return recomputeResult{path: PathRecomputeFailed}, fmt.Errorf("%w: upsert valid: %v", ErrRecomputeFailed, err)
	}

	return recomputeResult{payload: payload, path: PathRecomputed}, nil
}

// pollUntilValid is the cross-process coalescence wait loop. It re-reads
// the cache row every PollInterval and returns as soon as status flips to
// 'valid' (success) or 'error' (sibling-process recompute failed). It
// returns recompute_timeout when PollDeadline elapses without a terminal
// status, and recompute_failed when ctx is cancelled or a Get fails.
//
// On observed-valid the returned path is `PathCacheHit` (not
// `PathRecomputed`): Property 6 (design.md §16) defines `path = cache_hit
// iff Compute was not invoked`, and the local DataSource.Compute is not
// invoked along this branch — the payload comes from a sibling process's
// UpsertValid landing on the row. Returning PathRecomputed here would
// break Property 6 for the computing-fresh state.
//
// Note: while this loop runs we hold the singleflight slot for the key, so
// no other goroutine in the same process can enter the recompute path for
// the same key. That is exactly the invariant Property 7 requires
// (Compute called at most once across N concurrent same-key requests).
func (s *SmartLoader) pollUntilValid(
	ctx context.Context,
	def *ReportDefinition,
	filterHash string,
	opDate time.Time,
) (recomputeResult, error) {
	ticker := time.NewTicker(PollInterval)
	defer ticker.Stop()

	// time.NewTimer allocates a one-shot timer; for a single-call
	// function like pollUntilValid this is the simplest correct form.
	// Tests in task 10.2 inject a deterministic clock through s.now and
	// a hand-rolled ticker; this real-time path stays here.
	deadline := time.NewTimer(PollDeadline)
	defer deadline.Stop()

	for {
		select {
		case <-ctx.Done():
			return recomputeResult{path: PathRecomputeFailed}, fmt.Errorf("%w: %v", ErrRecomputeFailed, ctx.Err())

		case <-deadline.C:
			return recomputeResult{path: PathRecomputeTimeout}, ErrRecomputeTimeout

		case <-ticker.C:
			row, err := s.cache.Get(ctx, def.ID, filterHash, opDate)
			if err != nil {
				return recomputeResult{path: PathRecomputeFailed}, fmt.Errorf("%w: poll: %v", ErrRecomputeFailed, err)
			}
			if row == nil {
				// Row deleted out from under us (e.g. eviction
				// cron). Treat as "needs recompute" but we
				// cannot drop the singleflight slot from
				// inside this call — surface as
				// recompute_failed so the caller retries.
				return recomputeResult{path: PathRecomputeFailed}, fmt.Errorf("%w: cache row disappeared during poll", ErrRecomputeFailed)
			}
			switch row.Status {
			case CacheStatusValid:
				if row.Payload != nil {
					// Sibling-process recompute landed.
					// Local Compute was not invoked along
					// this branch, so Property 6 demands
					// PathCacheHit (cache_hit iff Compute
					// not invoked).
					return recomputeResult{payload: *row.Payload, path: PathCacheHit}, nil
				}
				// status='valid' without payload is structurally
				// impossible (UpsertValid always carries one);
				// continue polling rather than returning a
				// bogus empty payload.

			case CacheStatusError:
				reason := row.ErrorReason
				if reason == "" {
					reason = "sibling recompute reported error"
				}
				return recomputeResult{path: PathRecomputeFailed}, fmt.Errorf("%w: %s", ErrRecomputeFailed, reason)

			case CacheStatusComputing, CacheStatusStale:
				// Still in flight (or transitioned to stale by
				// an invalidator). Keep polling until the
				// deadline.
			}
		}
	}
}
