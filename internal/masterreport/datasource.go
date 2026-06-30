// Package masterreport contains the Master Consolidated Reporting Module.
//
// This file declares the DataSource adapter contract that every
// Report_Definition binds to. Two adapter shapes live alongside this
// interface in their own files (adapter_existing.go, adapter_new.go):
//
//   - existingHandlerAdapter — wraps a repository method already used by
//     a handler in internal/api/. The masterreport layer owns permission
//     enforcement and audit emission, so the adapter calls the underlying
//     repository directly rather than going through the HTTP shell. (Req 1.3.)
//   - newAggregationAdapter — runs a fresh SQL aggregation against the
//     application database. Used by the three reports that have no existing
//     handler equivalent: rfid_collection, daily_vehicle_deployment,
//     gts_weighbridge_summary. (Req 1.4.)
//
// Implementations MUST honor ctx cancellation at every blocking step and
// route per-vehicle / per-zone / per-ward fan-out through the supplied
// BoundedWorkerPool so the global concurrency cap holds across overlapping
// requests (Req 11.1, design §3.4).
//
// Requirements covered: 1.3, 1.4, 12.2.
package masterreport

import "context"

// DataSource is the adapter contract every Report_Definition binds to. The
// Catalog holds a non-nil DataSource per registered report and SmartLoader /
// ForceRecalculator invoke Compute under cache misses or force recompute
// requests.
//
// Design §3.4 fixes the interface shape; this declaration is the canonical
// in-code definition. Adapter implementations live in adapter_existing.go
// and adapter_new.go.
//
// Validates: Req 1.3, 1.4, 12.2.
type DataSource interface {
	// Compute runs the underlying query for the supplied filter set and
	// returns a fully-populated Payload (Rows, Totals, Header, GeneratedAt,
	// InputVersion). It MUST honor ctx cancellation at every blocking step
	// — long-running fan-out, database round trips, and downstream RPCs —
	// and MUST route per-vehicle / per-zone / per-ward parallelism through
	// the supplied BoundedWorkerPool so the module-wide concurrency cap
	// stays bounded (Req 11.1).
	//
	// Compute is invoked by SmartLoader (on cache miss / stale / error)
	// and by ForceRecalculator (always). The masterreport layer enforces
	// permission and audit once around the call site; implementations
	// must not duplicate either responsibility.
	//
	// Errors returned from Compute surface as recompute_failed at the
	// HTTP layer; the prior cache row is preserved so a subsequent
	// SmartLoad can retry without losing the previous payload (Req 6.7,
	// 7.6, 12.7).
	Compute(ctx context.Context, f FilterPayload, pool *BoundedWorkerPool) (Payload, error)

	// InputVersion returns the current monotonically increasing version of
	// the underlying input data for the supplied filter set. SmartLoader
	// compares this against the cache row's input_version column to detect
	// staleness independent of the wall-clock TTL (Req 12.2).
	//
	// Implementations that surface a real version (e.g.
	// EXTRACT(EPOCH FROM MAX(updated_at))::bigint over the source table)
	// MUST return that value. Implementations with no version concept MAY
	// return time.Now().UnixMilli(), which forces the cache row to look
	// stale on every read — appropriate only where the underlying source
	// is intrinsically real-time.
	//
	// InputVersion MUST honor ctx cancellation.
	InputVersion(ctx context.Context, f FilterPayload) (int64, error)
}
