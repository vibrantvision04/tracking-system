// Package masterreport contains the Master Consolidated Reporting Module.
//
// This file implements existingHandlerAdapter — the DataSource shape used by
// every report that has an underlying handler already living in
// internal/api/*_handlers.go. It is the bridge that satisfies Req 1.3: we
// do not copy SQL or business logic out of the existing report handlers; we
// call the same repository methods through a thin functional shim, and the
// masterreport layer owns permission enforcement and audit emission so
// neither responsibility runs twice.
//
// Design note on the missing `*api.Handler` field
// -----------------------------------------------
//
// The design document (§3.4) shows the adapter with an explicit
// `handler *api.Handler` field. Implementing that literally here would
// create an import cycle once task 15 wires HTTP routes onto these
// adapters: `internal/api` would need to import `internal/masterreport`
// (to register the handlers), and `internal/masterreport` would need to
// import `internal/api` (for the `*api.Handler` type). Go forbids that.
//
// The cycle-free design captures the handler inside a closure constructed
// at the registration site (which lives in `internal/api/master_report_*.go`
// — see task 8.x and task 15.x). The adapter therefore stores only the two
// function values, and the handler itself is part of the closure's free
// variable set:
//
//	// inside internal/api/, e.g. reports_road_sweeping.go (task 8.1)
//	def := &masterreport.ReportDefinition{
//	    ID: "road_sweeping_0700",
//	    DataSource: masterreport.NewExistingHandlerAdapter(
//	        func(ctx context.Context, f masterreport.FilterPayload, p *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
//	            return runShiftBasedOps(ctx, h /* *api.Handler */, f, p)
//	        },
//	        func(ctx context.Context, f masterreport.FilterPayload) (int64, error) {
//	            return shiftBasedOpsVersion(ctx, h, f)
//	        },
//	    ),
//	    // ...
//	}
//
// The same `*api.Handler` instance is captured by every adapter so they
// share the application's repository state, audit logger, RBAC repo, and
// Redis client without the masterreport package itself having to know
// about any of those types. This preserves the spec's intent ("wraps
// existing handlers' underlying repository methods") while keeping the
// dependency direction clean: api → masterreport, never the reverse.
//
// Requirements covered: 1.3, 12.2.
package masterreport

import (
	"context"
	"fmt"
	"time"
)

// ExistingComputeFunc is the closure signature a caller supplies to
// NewExistingHandlerAdapter for the report's Compute path. The caller is
// expected to capture the underlying `*api.Handler` (or any equivalent
// dependency carrier) in the closure's free variables, then invoke the
// matching repository method inside the function body.
//
// Implementations MUST honor ctx cancellation and, when fanning out across
// vehicles / zones / wards, route the work through the supplied pool so
// the module-wide concurrency cap stays bounded (Req 11.1).
type ExistingComputeFunc func(ctx context.Context, f FilterPayload, pool *BoundedWorkerPool) (Payload, error)

// ExistingInputVersionFunc is the closure signature for the report's
// InputVersion path. May be nil — when nil, existingHandlerAdapter falls
// back to `time.Now().UnixMilli()` so SmartLoader still has a monotonically
// non-decreasing value to compare against the cache row's input_version
// column (Req 12.2). The fallback effectively disables the version-based
// staleness gate for that report; the wall-clock TTL still applies.
type ExistingInputVersionFunc func(ctx context.Context, f FilterPayload) (int64, error)

// existingHandlerAdapter is the DataSource shape used by every report that
// wraps an existing handler. The struct itself is intentionally tiny:
//
//   - fn       — the compute closure (required).
//   - inputVer — the version closure (optional; nil triggers the fallback).
//
// Construct one through NewExistingHandlerAdapter rather than building the
// struct literal directly so the nil-fn guard runs in exactly one place.
type existingHandlerAdapter struct {
	fn       ExistingComputeFunc
	inputVer ExistingInputVersionFunc
}

// Compile-time guarantee that *existingHandlerAdapter satisfies DataSource.
// If the interface drifts away from the adapter shape this line stops
// compiling, which is the earliest signal we can wire up.
var _ DataSource = (*existingHandlerAdapter)(nil)

// NewExistingHandlerAdapter returns a DataSource that delegates Compute to
// `fn` and InputVersion to `inputVer`. `fn` is required; passing nil panics
// because such an adapter could never produce a payload and registering it
// in the Catalog would mean every Generate request for that report would
// surface a runtime nil-deref instead of a clean error at boot.
//
// `inputVer` is optional; nil installs the `time.Now().UnixMilli()`
// fallback documented on ExistingInputVersionFunc.
//
// The returned value is safe for concurrent use — it stores only the two
// closure values and never mutates them after construction.
func NewExistingHandlerAdapter(fn ExistingComputeFunc, inputVer ExistingInputVersionFunc) DataSource {
	if fn == nil {
		panic("masterreport: NewExistingHandlerAdapter called with nil compute func")
	}
	return &existingHandlerAdapter{
		fn:       fn,
		inputVer: inputVer,
	}
}

// Compute invokes the registered closure with the request's context, filter
// payload, and the shared BoundedWorkerPool. It does not pre-validate the
// filter payload — FilterValidator (task 4.1) runs before SmartLoader ever
// reaches this method — and it does not emit audit or check permissions,
// because both responsibilities are owned by the HTTP layer wrapped around
// the SmartLoader / ForceRecalculator call site (Req 1.3).
//
// Error handling: any error returned by `fn` is surfaced verbatim. The
// SmartLoader / ForceRecalculator caller maps the error to `recompute_failed`
// at the HTTP boundary and preserves the prior cache row (Req 6.7, 7.6).
func (a *existingHandlerAdapter) Compute(
	ctx context.Context,
	f FilterPayload,
	pool *BoundedWorkerPool,
) (Payload, error) {
	if a == nil || a.fn == nil {
		// NewExistingHandlerAdapter rejects nil fn at construction, so
		// this branch only fires when an external package builds the
		// struct literal directly (which it should not). Return an
		// error rather than panicking so the request path stays
		// recoverable.
		return Payload{}, fmt.Errorf("masterreport: existingHandlerAdapter has nil compute func")
	}
	return a.fn(ctx, f, pool)
}

// InputVersion invokes the registered version closure, or returns
// `time.Now().UnixMilli()` when no closure was supplied. The fallback
// produces a strictly increasing value within a single process so
// SmartLoader still observes monotonic semantics; it does mean the cache
// row's input_version column will appear to advance on every read, which
// in turn means the version-based staleness check degrades to "always
// matches" — the wall-clock TTL stays in force (Req 12.2).
//
// InputVersion honors ctx cancellation through the supplied closure; the
// fallback path does no I/O and so ignores ctx by construction.
func (a *existingHandlerAdapter) InputVersion(
	ctx context.Context,
	f FilterPayload,
) (int64, error) {
	if a == nil {
		// Defensive: see the Compute comment for why we degrade
		// gracefully rather than panic.
		return time.Now().UnixMilli(), nil
	}
	if a.inputVer == nil {
		return time.Now().UnixMilli(), nil
	}
	return a.inputVer(ctx, f)
}
