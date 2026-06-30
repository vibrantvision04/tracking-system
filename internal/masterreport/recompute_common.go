// Package masterreport contains the Master Consolidated Reporting Module.
//
// This file holds symbols that are shared between the two recompute
// orchestrators in the package — SmartLoader (smart_loader.go, task 10.1)
// and ForceRecalculator (force_recalculate.go, task 11.1).
//
// Both orchestrators agree on:
//
//   - The set of `path` strings surfaced to the HTTP layer (cache_hit,
//     recomputed, force_recomputed, recompute_failed, recompute_timeout).
//   - The sentinel error categories returned when a recompute cannot
//     produce a terminal valid row.
//   - The derivation of the singleflight key from a (report_id,
//     filter_hash, operational_date) triple. The two callers MUST agree
//     on this string exactly, otherwise a concurrent SmartLoad and
//     ForceRecalculate for the same key would race the same DataSource
//     instead of coalescing onto one Compute (Req 7.8, Property 7).
//
// Defining these once eliminates the duplicate-symbol build errors that
// arise when two files in the same package declare them independently,
// and it gives every other file in the package one canonical place to
// reach for when a new code path needs to return a recompute_failed or
// derive a singleflight key.
package masterreport

import (
	"context"
	"errors"
	"time"
)

// -----------------------------------------------------------------------------
// Path constants
// -----------------------------------------------------------------------------

// Path values surfaced to the HTTP layer in the `path` field of every
// master-report response (Req 6.5, 7.7). They are stable strings that the
// frontend switches on, so changing the wire form is a breaking change.
const (
	// PathCacheHit — the cache held a row in status='valid' whose
	// computed_at sat within the TTL window, so no recompute was needed.
	// Returned by SmartLoader.Load only.
	PathCacheHit = "cache_hit"

	// PathRecomputed — SmartLoader ran (or polled and then observed)
	// a fresh DataSource.Compute that produced a new payload.
	PathRecomputed = "recomputed"

	// PathForceRecomputed — ForceRecalculator ran a fresh
	// DataSource.Compute on the user's explicit request, bypassing the
	// cache read side and overwriting the prior payload.
	PathForceRecomputed = "force_recomputed"

	// PathRecomputeFailed — a recompute (Smart or Force) failed before
	// producing a committed-valid row. The accompanying error carries
	// the failure category; the cache row is rolled back to its prior
	// status with the prior payload preserved (Req 6.7, 7.6).
	PathRecomputeFailed = "recompute_failed"

	// PathRecomputeTimeout — SmartLoader polled a sibling-process
	// recompute beyond PollDeadline without observing status='valid'.
	// Distinct from PathRecomputeFailed so the HTTP layer can render
	// the timeout path without inferring it from the error message.
	PathRecomputeTimeout = "recompute_timeout"
)

// -----------------------------------------------------------------------------
// Sentinel errors
// -----------------------------------------------------------------------------

// ErrUnknownReportID is returned when Load / Recalculate is invoked with a
// ReportID that is not present in the catalog. Callers map this to HTTP
// 404 at the boundary; the orchestrators themselves never recover from it.
var ErrUnknownReportID = errors.New("master report: unknown report_id")

// ErrRecomputeFailed wraps every failure category that originates from the
// recompute path (cache I/O, DataSource.Compute, UpsertValid). The
// underlying cause is preserved via fmt.Errorf("%w: …", ErrRecomputeFailed,
// cause); callers can errors.Is(err, ErrRecomputeFailed) to detect the
// category without parsing strings.
var ErrRecomputeFailed = errors.New("master report: recompute failed")

// ErrRecomputeTimeout fires when a SmartLoader poll on a sibling-process
// recompute crosses PollDeadline (30s) without observing status='valid'.
// Distinct from ErrRecomputeFailed so the HTTP layer can render the
// timeout path (recompute_timeout) instead of the generic failed path.
var ErrRecomputeTimeout = errors.New("master report: recompute timed out")

// -----------------------------------------------------------------------------
// Singleflight key derivation
// -----------------------------------------------------------------------------

// singleflightKey is the string used as the singleflight.Group key for a
// (report_id, filter_hash, operational_date) triple. It mirrors the cache
// row's primary key, normalised to UTC midnight so two clocks in different
// zones produce the same key for the same operational day.
//
// Both SmartLoader and ForceRecalculator MUST route their group.Do calls
// through this helper. Two callers using different key formats would
// allocate independent singleflight slots and race the same DataSource
// instead of sharing one Compute — defeating Req 7.8 and Property 7.
func singleflightKey(reportID ReportID, filterHash string, opDate time.Time) string {
	return string(reportID) + "|" + filterHash + "|" + opDate.UTC().Format("2006-01-02")
}

// -----------------------------------------------------------------------------
// Shared singleflight result type
// -----------------------------------------------------------------------------

// recomputeResult is the payload returned by the function passed to
// singleflight.Group.Do by BOTH SmartLoader.Load and
// ForceRecalculator.Recalculate.
//
// The two orchestrators share one *singleflight.Group (Req 7.8). When a
// SmartLoad and a ForceRecalc race the same key, only one of them runs
// the wrapped function; every other caller receives the leader's return
// value via the singleflight library and decodes it through a type
// assertion. If the two callers used different wrapper struct types
// (e.g. a private loadResult and a private recalcResult), the follower's
// type assertion against the leader's struct would fail silently and
// return a zero-value wrapper — which the caller would surface as an
// empty Payload with an empty path. That is exactly the failure mode
// Property 7's TestConcurrentRecomputeCoalescence is designed to catch.
//
// Defining one shared struct here makes the type assertions on both
// sides decode the same value regardless of which orchestrator led the
// flight. The path field still carries the leader's path verbatim
// (recomputed when SmartLoader led, force_recomputed when
// ForceRecalculator led), which Property 7 explicitly accepts.
type recomputeResult struct {
	payload Payload
	path    string
}

// -----------------------------------------------------------------------------
// Shared rollback-status helper
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// cacheStore interface
// -----------------------------------------------------------------------------

// cacheStore is the narrow contract SmartLoader and ForceRecalculator need
// from the report_output_cache layer. *OutputCacheRepo (output_cache_repo.go)
// is the production implementation; tests substitute an in-memory fake to
// exercise the orchestrators without spinning up Postgres.
//
// The interface is intentionally package-private — no caller outside the
// masterreport package has a reason to depend on it. Production wiring in
// cmd/server/main.go passes a *OutputCacheRepo to NewSmartLoader /
// NewForceRecalculator, which Go's structural typing transparently
// satisfies.
//
// MarkStale and EvictOlderThan live on *OutputCacheRepo because they are
// invoked from invalidation hooks and the daily cron, neither of which goes
// through SmartLoader / ForceRecalculator. They are therefore intentionally
// omitted from this interface.
type cacheStore interface {
	Get(ctx context.Context, reportID ReportID, hash string, opDate time.Time) (*CacheRow, error)
	UpsertComputing(ctx context.Context, key CacheKey, computingSince time.Time) error
	UpsertValid(ctx context.Context, key CacheKey, payload Payload, inputVersion int64, computedAt time.Time) error
	RestorePriorStatus(ctx context.Context, key CacheKey, priorStatus CacheStatus) error
}

// Compile-time check that *OutputCacheRepo satisfies cacheStore. Drift in
// either type immediately fails the build at this line instead of
// surfacing as a runtime nil interface value somewhere deeper.
var _ cacheStore = (*OutputCacheRepo)(nil)

// priorStatusForRollback picks the status RestorePriorStatus should write
// when a recompute fails. The two orchestrators agree on this mapping:
//
//   - No prior row (UpsertComputing just created it) → 'error'. The row
//     exists now, and 'error' is the correct closed-loop terminal state
//     for an attempt that produced no payload.
//   - Prior in 'valid' / 'stale' / 'error' → preserve. A subsequent
//     SmartLoad will then re-evaluate the row under its own TTL / status
//     rules instead of starting from an artificially-fresh state.
//   - Prior in 'computing' → collapse to 'error'. We only reach the
//     rollback path because we took over a stale-computing row, and
//     handing it back to 'computing' would let the stale-computing branch
//     pick it up again on the next call.
//   - Anything else (defensive: a future status this code does not know
//     about) → 'error'.
//
// The helper is package-private because no caller outside the recompute
// orchestrators has a use for it.
func priorStatusForRollback(prior *CacheRow) CacheStatus {
	if prior == nil {
		return CacheStatusError
	}
	switch prior.Status {
	case CacheStatusValid, CacheStatusStale, CacheStatusError:
		return prior.Status
	case CacheStatusComputing:
		return CacheStatusError
	default:
		return CacheStatusError
	}
}
