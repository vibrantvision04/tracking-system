package masterreport

// filter_hash_property_test.go — task 4.3 (Property 1).
//
// Property 1: Filter_Hash Order Independence.
//
// For any FilterPayload p whose keys are drawn from the closed FilterKey
// enum, FilterHash(def, p) must depend solely on the set of (key, value)
// pairs, not on the order in which those pairs were inserted into the Go
// map that backs FilterPayload. This is the property that makes
// `report_output_cache.filter_hash` a stable cache key regardless of how a
// client serialised its filter parameters on the wire.
//
// The test draws a 1..11-element subset of FilterKey, gives each key a
// value whose Go type matches the canonicalisation rules in filter_hash.go,
// builds the canonical payload, asks rapid for a permutation of the same
// pairs, builds a second payload from the permuted pairs, and asserts both
// FilterHash digests are byte-equal.
//
// The Report_Definition used by the test declares every FilterKey as
// optional so Validator.Validate accepts every drawn subset; that isolates
// the property under test (the hash) as the only variable.

import (
	"testing"
	"time"

	"pgregory.net/rapid"
)

// TestFilterHashOrderIndependence is Property 1 from the
// master-consolidated-reporting spec.
//
// Validates: Requirements 2.6, 12.1
func TestFilterHashOrderIndependence(t *testing.T) {
	def := &ReportDefinition{
		ID:            ReportID("filter_hash_order_independence"),
		Name:          "Filter Hash Order Independence",
		Category:      CategoryConsolidated,
		PermissionKey: "reports.filter_hash_order_independence.view",
		Filters:       allOptionalFilterControls(),
	}

	rapid.Check(t, func(rt *rapid.T) {
		all := AllFilterKeys()

		// Pick a random subset of size n ∈ [1, len(AllFilterKeys())] by
		// permuting the full key list and taking the first n entries.
		// Going through Permutation rather than SliceOfNDistinct(elem=int)
		// keeps the chosen subset itself random instead of always being a
		// declaration-order prefix.
		keyPerm := rapid.Permutation(all).Draw(rt, "key_permutation")
		n := rapid.IntRange(1, len(all)).Draw(rt, "n")
		keys := keyPerm[:n]

		// Build the (key, value) pair list once. Both maps that follow
		// must observe the same pairs so the only difference between
		// them is map insertion order.
		pairs := make([]filterEntry, n)
		for i, k := range keys {
			pairs[i] = filterEntry{key: k, value: drawFilterValue(rt, k)}
		}

		original := FilterPayload{}
		for _, e := range pairs {
			original[e.key] = e.value
		}

		// rapid.Permutation gives us a freshly shuffled view of the same
		// pair slice; building a map by walking that permutation
		// guarantees the second FilterPayload is constructed in a
		// different insertion order from the first whenever the
		// permutation differs from the identity.
		permuted := rapid.Permutation(pairs).Draw(rt, "pair_permutation")
		shuffled := FilterPayload{}
		for _, e := range permuted {
			shuffled[e.key] = e.value
		}

		h1, err := FilterHash(def, original)
		if err != nil {
			rt.Fatalf("FilterHash(original) returned error: %v\n  pairs: %+v", err, pairs)
		}
		h2, err := FilterHash(def, shuffled)
		if err != nil {
			rt.Fatalf("FilterHash(shuffled) returned error: %v\n  permuted: %+v", err, permuted)
		}
		if h1 != h2 {
			rt.Fatalf(
				"FilterHash differs under key permutation:\n  original=%s\n  shuffled=%s\n  pairs=%+v\n  permuted=%+v",
				h1, h2, pairs, permuted,
			)
		}
	})
}

// filterEntry is a (key, value) pair used by the order-independence test to
// keep a stable, ordered view of the payload contents across the original
// map and its permuted counterpart.
type filterEntry struct {
	key   FilterKey
	value any
}

// allOptionalFilterControls returns one FilterControl per FilterKey with
// Required=false. Used by the order-independence test so the Validator
// accepts every drawn subset of keys, isolating FilterHash as the only
// variable under test.
func allOptionalFilterControls() []FilterControl {
	keys := AllFilterKeys()
	out := make([]FilterControl, len(keys))
	for i, k := range keys {
		out[i] = FilterControl{Key: k, Required: false}
	}
	return out
}

// drawFilterValue returns a rapid-drawn value whose Go type matches the
// closed canonicalisation set in filter_hash.go for the given FilterKey:
//
//   FilterDate                                   → time.Time (UTC)
//   FilterDateRange                              → [2]time.Time (UTC, start ≤ end)
//   FilterVehicle, FilterEmployee                → string or int (alternated)
//   FilterZone, FilterWard, FilterShift,
//   FilterRoute, FilterRouteType,
//   FilterDepartment, FilterDesignation          → string
//
// Numeric ranges are bounded so generated time.Time values stay inside the
// representable RFC3339Nano span, and string draws stay non-empty so the
// Validator does not treat them as "missing".
func drawFilterValue(rt *rapid.T, k FilterKey) any {
	switch k {
	case FilterDate:
		secs := rapid.Int64Range(0, 4_102_444_800).Draw(rt, "date_secs_"+string(k))
		return time.Unix(secs, 0).UTC()

	case FilterDateRange:
		start := rapid.Int64Range(0, 4_102_444_800).Draw(rt, "range_start_"+string(k))
		end := rapid.Int64Range(start, 4_102_444_800).Draw(rt, "range_end_"+string(k))
		return [2]time.Time{
			time.Unix(start, 0).UTC(),
			time.Unix(end, 0).UTC(),
		}

	case FilterVehicle, FilterEmployee:
		// Vehicle and employee accept both string and int per design §3.3;
		// alternate so both canonicalisation paths are exercised across
		// rapid trials.
		if rapid.Bool().Draw(rt, "id_kind_"+string(k)) {
			return rapid.IntRange(0, 1_000_000).Draw(rt, "id_int_"+string(k))
		}
		return rapid.StringMatching(`[A-Za-z0-9_-]{1,16}`).Draw(rt, "id_str_"+string(k))

	default:
		// zone, ward, shift, route, route_type, department, designation:
		// raw UTF-8 strings; canonicalisation does not trim or fold case.
		return rapid.StringMatching(`[A-Za-z0-9_-]{1,16}`).Draw(rt, "str_"+string(k))
	}
}
