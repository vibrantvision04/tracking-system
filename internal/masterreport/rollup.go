// Package masterreport contains the Master Consolidated Reporting Module.
//
// rollup.go defines a shared roll-up helper used by the seven pure
// aggregation reports (#5, #8, #14, #16, #18, #20, #26 in
// docs/master-reports-catalog.md). Each of those reports is a
// group-by-and-aggregate over a detail report's row set:
//
//	helper_attendance_summary   ← helper_attendance      (zone × firm)
//	street_sweeper_summary      ← govt_street_sweeper… (zone)
//	d2d_zone_summary            ← d2d_vehicle_coverage   (zone × firm)
//	street_sweeping_summary     ← street_sweeping_detail (zone × firm)
//	commercial_hopper_summary   ← d2d_working_check      (zone × firm)
//	beet_sweeping_summary       ← safai_karamchari_worked (zone)
//	evening_commercial_summary  ← evening_commercial_detail (zone × firm)
//
// Rather than re-implement the same group-by-and-aggregate code seven
// times we expose a single helper that takes the detail report's compute
// closure, the group-by key set, and a per-output-column aggregation
// spec. The helper invokes the detail closure once, materialises the row
// set, groups, and produces the summary rows.
//
// The helper does not query the database directly — that is the detail
// closure's job. This keeps the wrapping clean: the detail closure can
// be an `httptest.NewRecorder`-driven adapter today and tomorrow a
// repository-direct adapter; the rollup helper does not care.
//
// Requirements covered: 1.4, 11.1 (the detail compute is the only place
// that fans out concurrently — the rollup is a single-pass aggregation
// over an already-materialised row set).
package masterreport

import (
	"context"
	"fmt"
	"sort"
	"time"
)

// AggOp is the closed set of aggregation operations a rollup output
// column may carry. It mirrors the marker strings used by TotalsRow
// (sum, avg, weighted_avg, count, count_distinct) plus the operators
// the rollup grammar needs in practice. The aggregator switches on the
// AggOp.Kind value to decide how to fold the detail rows.
type AggOp struct {
	// Kind is one of "sum", "avg", "count", "count_distinct",
	// "count_nonempty", "weighted_avg", "first", "min", "max".
	Kind string

	// SourceKey is the detail-row column the operation reads. When
	// empty, the rollup helper falls back to the output column's own
	// key so the simple "rename + sum" case stays terse.
	SourceKey string

	// WeightKey applies only to Kind == "weighted_avg". It names the
	// detail-row column used as the per-row weight. Empty WeightKey
	// in weighted_avg mode degrades to a plain mean.
	WeightKey string
}

// RollupSpec drives a single rollup pass.
//
//   - GroupBy lists the detail-row column keys whose values define the
//     output bucket. Output rows are emitted in lexicographic order of
//     the concatenated group values, with each GroupBy column copied
//     into the output row under its own key.
//   - Outputs maps the OUTPUT row column key (matching the catalog) to
//     the AggOp that produces its value. Output columns whose key is
//     in GroupBy do not need an entry here — they are copied directly.
//   - SrNoKey, when non-empty, asks the helper to populate that column
//     with a 1-based sequence number per output row. Most reports want
//     "sr_no" here; the empty string disables sequencing entirely.
type RollupSpec struct {
	GroupBy []string
	Outputs map[string]AggOp
	SrNoKey string
}

// Rollup returns an ExistingComputeFunc that, when invoked, runs the
// supplied detail compute closure and folds the result into the rollup
// rows defined by spec. The returned closure is suitable for direct use
// as the `compute` argument to any Register<Name> helper in
// internal/masterreport/reports_*.go.
//
// The detail closure is invoked with the SAME ctx, filter payload, and
// pool that the rollup itself receives, so any required filter (date,
// zone, firm) flows through unchanged.
//
// If the detail closure returns an error, Rollup propagates it
// verbatim — SmartLoader / ForceRecalculator will then surface it as
// recompute_failed at the HTTP boundary, preserving the prior cache
// row (Req 6.7, 7.6).
func Rollup(detail ExistingComputeFunc, spec RollupSpec) ExistingComputeFunc {
	return func(ctx context.Context, f FilterPayload, pool *BoundedWorkerPool) (Payload, error) {
		if detail == nil {
			return Payload{}, fmt.Errorf("masterreport: Rollup called with nil detail compute")
		}
		detailPayload, err := detail(ctx, f, pool)
		if err != nil {
			return Payload{}, err
		}

		rows := aggregate(detailPayload.Rows, spec)

		now := time.Now().UTC()
		return Payload{
			Rows:         rows,
			GeneratedAt:  now,
			InputVersion: now.UnixMilli(),
		}, nil
	}
}

// aggregate is the pure-function core of Rollup, split out so unit
// tests can exercise it without driving a compute closure.
func aggregate(detailRows []map[string]any, spec RollupSpec) []map[string]any {
	// Bucket the detail rows by the group-by key tuple.
	type bucket struct {
		key  string
		vals map[string]any // copy of group-by values for this bucket
		rows []map[string]any
	}
	buckets := make(map[string]*bucket, 16)
	order := make([]string, 0, 16)

	for _, dr := range detailRows {
		key, vals := groupKey(dr, spec.GroupBy)
		b, ok := buckets[key]
		if !ok {
			b = &bucket{key: key, vals: vals, rows: make([]map[string]any, 0, 4)}
			buckets[key] = b
			order = append(order, key)
		}
		b.rows = append(b.rows, dr)
	}

	// Stable ordering: sort by the concatenated key so output is
	// reproducible across runs.
	sort.Strings(order)

	out := make([]map[string]any, 0, len(order))
	for i, k := range order {
		b := buckets[k]
		row := make(map[string]any, len(spec.GroupBy)+len(spec.Outputs)+1)
		// Copy group-by columns into the output row.
		for kk, vv := range b.vals {
			row[kk] = vv
		}
		// Compute aggregated columns.
		for outKey, op := range spec.Outputs {
			sourceKey := op.SourceKey
			if sourceKey == "" {
				sourceKey = outKey
			}
			row[outKey] = computeAgg(b.rows, op, sourceKey)
		}
		// Sr-no.
		if spec.SrNoKey != "" {
			row[spec.SrNoKey] = i + 1
		}
		out = append(out, row)
	}
	return out
}

// groupKey produces the concatenated bucket key for a detail row plus
// a snapshot of the bucket-defining values so the output row can copy
// them back in.
func groupKey(dr map[string]any, keys []string) (string, map[string]any) {
	vals := make(map[string]any, len(keys))
	key := ""
	for i, k := range keys {
		if i > 0 {
			key += "\x1f"
		}
		v := dr[k]
		vals[k] = v
		key += fmt.Sprintf("%v", v)
	}
	return key, vals
}

// computeAgg folds the bucket's detail rows into the single value the
// output column expects. Kinds it does not recognise produce nil so a
// downstream renderer surfaces an empty cell rather than panicking.
func computeAgg(rows []map[string]any, op AggOp, sourceKey string) any {
	switch op.Kind {
	case "sum":
		var s float64
		for _, r := range rows {
			s += toFloat(r[sourceKey])
		}
		// Return int when every input was integer-shaped.
		if isAllInt(rows, sourceKey) {
			return int64(s)
		}
		return s
	case "avg":
		if len(rows) == 0 {
			return float64(0)
		}
		var s float64
		for _, r := range rows {
			s += toFloat(r[sourceKey])
		}
		return s / float64(len(rows))
	case "weighted_avg":
		if op.WeightKey == "" {
			// Fall back to plain mean if no weight column provided.
			return computeAgg(rows, AggOp{Kind: "avg"}, sourceKey)
		}
		var num, den float64
		for _, r := range rows {
			w := toFloat(r[op.WeightKey])
			num += toFloat(r[sourceKey]) * w
			den += w
		}
		if den == 0 {
			return float64(0)
		}
		return num / den
	case "count":
		return int64(len(rows))
	case "count_distinct":
		seen := make(map[string]struct{}, len(rows))
		for _, r := range rows {
			seen[fmt.Sprintf("%v", r[sourceKey])] = struct{}{}
		}
		return int64(len(seen))
	case "count_nonempty":
		n := int64(0)
		for _, r := range rows {
			v := r[sourceKey]
			if v == nil {
				continue
			}
			if s, ok := v.(string); ok && s == "" {
				continue
			}
			n++
		}
		return n
	case "first":
		for _, r := range rows {
			if v, ok := r[sourceKey]; ok && v != nil {
				return v
			}
		}
		return nil
	case "min":
		var m float64
		set := false
		for _, r := range rows {
			v := toFloat(r[sourceKey])
			if !set || v < m {
				m = v
				set = true
			}
		}
		if !set {
			return nil
		}
		return m
	case "max":
		var m float64
		set := false
		for _, r := range rows {
			v := toFloat(r[sourceKey])
			if !set || v > m {
				m = v
				set = true
			}
		}
		if !set {
			return nil
		}
		return m
	default:
		return nil
	}
}

// toFloat best-effort coerces an arbitrary map value to float64. The
// adapter row stream comes through `[]map[string]any` so we get
// whatever the pgx driver / JSON decoder produced — int64, float64,
// numeric string, or nil — and need to handle all of them.
func toFloat(v any) float64 {
	switch t := v.(type) {
	case nil:
		return 0
	case float64:
		return t
	case float32:
		return float64(t)
	case int:
		return float64(t)
	case int32:
		return float64(t)
	case int64:
		return float64(t)
	case uint:
		return float64(t)
	case uint32:
		return float64(t)
	case uint64:
		return float64(t)
	case bool:
		if t {
			return 1
		}
		return 0
	case string:
		// Try a numeric parse. Many JSON decoders surface integers as
		// strings when the source column was BIGINT.
		var f float64
		_, _ = fmt.Sscanf(t, "%g", &f)
		return f
	default:
		return 0
	}
}

// isAllInt reports whether every value at sourceKey is integer-shaped
// (int/int32/int64 or a float64 with no fractional component). Used by
// computeAgg's "sum" case to preserve integer return types for counts.
func isAllInt(rows []map[string]any, sourceKey string) bool {
	for _, r := range rows {
		switch t := r[sourceKey].(type) {
		case nil:
			continue
		case int, int32, int64, uint, uint32, uint64:
			continue
		case float64:
			if t != float64(int64(t)) {
				return false
			}
		case float32:
			if t != float32(int32(t)) {
				return false
			}
		default:
			return false
		}
	}
	return true
}
