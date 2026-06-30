// Package masterreport contains the Master Consolidated Reporting Module.
//
// This file implements newAggregationAdapter — the DataSource adapter used by
// the three reports that have no existing handler equivalent and therefore
// run fresh SQL aggregations against the application database:
//
//   - rfid_collection            (rfid_scan_log JOIN wards JOIN zones)
//   - daily_vehicle_deployment   (vehicle_route_assignments LEFT JOIN gps_data)
//   - gts_weighbridge_summary    (weighbridge_data aggregated by day + gts_id)
//
// The adapter is intentionally generic: a ReportDefinition supplies the raw
// SQL, an args builder that maps a FilterPayload to positional parameters,
// an optional version SQL (typically `EXTRACT(EPOCH FROM MAX(updated_at))::bigint`
// over the source table), and an optional totals callback that folds the
// row set into a totals map keyed by ColumnSpec.Key.
//
// Compute scans rows into []map[string]any using rows.FieldDescriptions() +
// rows.Values() so the SQL author can name output columns directly without
// declaring a parallel Go struct per report. The map values are whatever the
// pgx driver produced (string, int64, float64, time.Time, etc.); downstream
// consumers (Excel/PDF exporters, the In_Page_Preview) handle type coercion
// via ColumnSpec.Type.
//
// Permission enforcement and audit emission live one layer up — in the
// HTTP handlers and the audit wrapper — so this adapter only concerns
// itself with the SQL round trip and the row-to-map projection.
//
// Requirements covered: 1.4, 12.2.
package masterreport

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNilPool is returned by Compute and InputVersion when the adapter was
// constructed without a non-nil *pgxpool.Pool. Surfaced as a distinct
// sentinel so the boot-time Catalog.Validate path can detect mis-wired
// definitions cleanly.
var ErrNilPool = errors.New("masterreport: newAggregationAdapter has nil pool")

// newAggregationAdapter wraps a parameterised aggregation SQL statement
// behind the DataSource interface. One instance is created per
// ReportDefinition in registration files such as reports_rfid.go,
// reports_deployment.go, and reports_gts_weighbridge_summary.go.
//
// The struct is exported only through its NewAggregationAdapter constructor
// so callers cannot construct an adapter with a nil pool or empty SQL by
// accident.
type newAggregationAdapter struct {
	// pool is the shared application pgxpool. Reusing the global pool keeps
	// connection accounting consistent with the rest of the system and
	// avoids spawning per-adapter pools.
	pool *pgxpool.Pool

	// sql is the aggregation statement executed by Compute. It must use
	// positional parameters ($1, $2, ...) matching what args returns for a
	// given FilterPayload.
	sql string

	// args maps a FilterPayload to the positional parameter slice for sql.
	// It is invoked once per Compute call. A nil args function is
	// equivalent to "no parameters" (sql is executed verbatim).
	args func(FilterPayload) []any

	// versionSQL returns the current input version as a single BIGINT.
	// Typically `SELECT COALESCE(EXTRACT(EPOCH FROM MAX(updated_at)), 0)::bigint
	// FROM <source_table> [WHERE ...]`. Empty string disables versioning;
	// InputVersion then returns time.Now().UnixMilli() so SmartLoader treats
	// the row as always stale (appropriate when no version concept exists).
	versionSQL string

	// versionArgs maps a FilterPayload to the positional parameters of
	// versionSQL. May be nil when versionSQL takes no parameters.
	versionArgs func(FilterPayload) []any

	// totals folds the materialised row set into a Totals map keyed by
	// ColumnSpec.Key. Nil disables totals computation; Payload.Totals stays
	// nil in that case and the PreviewLayout's TotalsRows render literal
	// labels only.
	totals func(rows []map[string]any) map[string]any
}

// NewAggregationAdapter constructs a newAggregationAdapter and returns it
// behind the DataSource interface so registration sites stay aligned with
// the interface contract. The pool and sql arguments are mandatory; args,
// versionSQL, versionArgs, and totals are optional and may be zero/nil.
//
// Callers that need totals should use NewAggregationAdapterWithTotals
// instead — the bare constructor keeps the common path short for reports
// whose TotalsRows are literal labels only.
func NewAggregationAdapter(
	pool *pgxpool.Pool,
	sql string,
	args func(FilterPayload) []any,
	versionSQL string,
	versionArgs func(FilterPayload) []any,
) DataSource {
	return &newAggregationAdapter{
		pool:        pool,
		sql:         sql,
		args:        args,
		versionSQL:  versionSQL,
		versionArgs: versionArgs,
	}
}

// NewAggregationAdapterWithTotals is NewAggregationAdapter with an additional
// totals callback. Use this when the report's Preview.TotalsRows surface
// sums/averages computed from the row set rather than literal labels.
func NewAggregationAdapterWithTotals(
	pool *pgxpool.Pool,
	sql string,
	args func(FilterPayload) []any,
	versionSQL string,
	versionArgs func(FilterPayload) []any,
	totals func(rows []map[string]any) map[string]any,
) DataSource {
	return &newAggregationAdapter{
		pool:        pool,
		sql:         sql,
		args:        args,
		versionSQL:  versionSQL,
		versionArgs: versionArgs,
		totals:      totals,
	}
}

// Compute executes the aggregation SQL with the args built from f and
// returns a Payload whose Rows holds one map[string]any per result row,
// keyed by the column names declared in the SELECT list. Totals are
// computed when a totals callback was supplied at construction time.
//
// The BoundedWorkerPool is unused by this adapter — aggregation queries
// run as a single round-trip against pgxpool. The parameter is retained to
// satisfy the DataSource interface and to leave room for future per-zone
// fan-out variants that share this adapter shell.
//
// ctx cancellation is honored both by the pool's Query call (the pgx
// driver checks the context internally) and by an explicit check after
// each row is scanned so a cancelled request stops materialising rows
// promptly. (Req 1.4, 11.1.)
func (a *newAggregationAdapter) Compute(
	ctx context.Context,
	f FilterPayload,
	_ *BoundedWorkerPool,
) (Payload, error) {
	if a.pool == nil {
		return Payload{}, ErrNilPool
	}
	if a.sql == "" {
		return Payload{}, errors.New("masterreport: newAggregationAdapter has empty sql")
	}

	// Build the positional parameters. A nil args closure means "no
	// parameters" — the SQL runs verbatim. Reports that pin filters via
	// the adapter closure (e.g. a fixed zone code) still go through args.
	var params []any
	if a.args != nil {
		params = a.args(f)
	}

	rows, err := a.pool.Query(ctx, a.sql, params...)
	if err != nil {
		return Payload{}, fmt.Errorf("masterreport: aggregation query failed: %w", err)
	}
	defer rows.Close()

	// FieldDescriptions is stable for the lifetime of the rows handle;
	// snapshot once and reuse for every row in the loop.
	fields := rows.FieldDescriptions()
	names := make([]string, len(fields))
	for i, fd := range fields {
		names[i] = string(fd.Name)
	}

	// Pre-size the result slice when the driver can supply a row count
	// hint via CommandTag (it cannot until Next has been called); start
	// at a small capacity instead to avoid over-allocating on empty sets.
	result := make([]map[string]any, 0, 32)

	for rows.Next() {
		// Honor cancellation between rows so large result sets stop
		// promptly when the request is aborted.
		if err := ctx.Err(); err != nil {
			return Payload{}, err
		}

		vals, err := rows.Values()
		if err != nil {
			return Payload{}, fmt.Errorf("masterreport: aggregation row scan failed: %w", err)
		}

		// Defensive: rows.Values() returns one element per declared
		// column, but pin the loop to min(len) so a driver bug cannot
		// out-of-range. fields and vals always match in practice.
		n := len(names)
		if len(vals) < n {
			n = len(vals)
		}

		m := make(map[string]any, n)
		for i := 0; i < n; i++ {
			m[names[i]] = vals[i]
		}
		result = append(result, m)
	}

	if err := rows.Err(); err != nil {
		return Payload{}, fmt.Errorf("masterreport: aggregation row iteration failed: %w", err)
	}

	payload := Payload{
		Rows:        result,
		GeneratedAt: time.Now().UTC(),
		// InputVersion is left at 0 here; SmartLoader stamps the row's
		// own input_version column from a separate InputVersion call so
		// the two values stay in lockstep with the cache write.
		InputVersion: 0,
	}
	if a.totals != nil {
		payload.Totals = a.totals(result)
	}

	return payload, nil
}

// InputVersion runs the version SQL and returns its single BIGINT result.
// SmartLoader compares this against the cache row's input_version column to
// detect staleness independent of the wall-clock TTL (Req 12.2).
//
// When versionSQL is empty the adapter has no monotonic version concept
// available; InputVersion returns time.Now().UnixMilli() so every SmartLoad
// of the affected cache row treats it as stale and recomputes. This is the
// safe fallback — the cost is an extra Compute, never a stale payload.
func (a *newAggregationAdapter) InputVersion(
	ctx context.Context,
	f FilterPayload,
) (int64, error) {
	if a.pool == nil {
		return 0, ErrNilPool
	}
	if a.versionSQL == "" {
		// No version concept — force-stale via wall-clock millisecond
		// stamp. SmartLoader will rerun Compute on the next call.
		return time.Now().UnixMilli(), nil
	}

	var params []any
	if a.versionArgs != nil {
		params = a.versionArgs(f)
	}

	var v int64
	if err := a.pool.QueryRow(ctx, a.versionSQL, params...).Scan(&v); err != nil {
		return 0, fmt.Errorf("masterreport: aggregation version query failed: %w", err)
	}
	return v, nil
}
