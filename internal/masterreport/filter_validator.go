package masterreport

// filter_validator.go — task 4.1 (design §3.3).
//
// Purpose: gate every FilterPayload that arrives at the masterreport HTTP
// surface before it ever reaches FilterHash or DataSource.Compute. The
// validator is intentionally narrow:
//
//   - It collects every required key missing from the payload.
//   - It collects every payload key not declared in the Report_Definition.
//   - It produces a ValidationError whose Error() string is stable across
//     runs, suitable for inclusion in a 400 response body and for use as a
//     test oracle.
//
// What the validator does NOT do (handled elsewhere):
//
//   - Type-shape checks for individual values (FilterHash canonicalisation
//     in task 4.2 rejects values whose Go type it cannot serialise).
//   - Cross-key semantic checks (e.g. date_range[0] <= date_range[1]) —
//     those are DataSource concerns or future per-control predicates.
//   - Invoking any data source (Req 2.7, Property 2).
//
// Empty-value rules per the task body and design §3.3:
//
//   nil                       ⇒ missing
//   "" (string)               ⇒ missing
//   []int with len 0          ⇒ missing
//   time.Time.IsZero()        ⇒ missing
//   [2]time.Time both zero    ⇒ missing
//
// Anything else (including a literal int 0) counts as supplied. The
// validator is deliberately conservative about what it treats as missing
// so that legitimately-zero ids round-trip without surprises.

import (
	"fmt"
	"reflect"
	"sort"
	"strings"
	"time"
)

// Validator runs the filter-validation pass for a Report_Definition.
//
// The zero value of Validator is usable; the type is a struct rather than a
// free function so future extensions (zone / ward enum lookup, per-control
// predicate registry) can grow new fields without breaking the call sites
// already wired up through the masterreport HTTP handlers (task 15.1).
type Validator struct{}

// ValidationError is the error type returned by Validator.Validate when at
// least one missing or unsupported key is discovered. The two slices are
// disjoint by construction:
//
//   - Missing contains the keys declared as Required in def.Filters that
//     were absent or empty in the payload.
//   - Unsupported contains the keys present in the payload that are not
//     declared in def.Filters at all.
//
// The slices may be returned unsorted; Error() sorts copies internally so
// the rendered message is deterministic across runs and across map-iteration
// randomisation.
type ValidationError struct {
	Missing     []FilterKey
	Unsupported []FilterKey
}

// Error returns a stable, deterministic message in the form:
//
//	filter validation failed: missing=[a,b] unsupported=[c,d]
//
// Both lists are lexicographically sorted; both sides are always emitted
// even when empty so the message shape is predictable for log scraping and
// test assertions.
func (e *ValidationError) Error() string {
	return fmt.Sprintf(
		"filter validation failed: missing=[%s] unsupported=[%s]",
		strings.Join(sortedKeyStrings(e.Missing), ","),
		strings.Join(sortedKeyStrings(e.Unsupported), ","),
	)
}

// sortedKeyStrings returns a lexicographically sorted []string copy of the
// input. The caller's slice is never mutated.
func sortedKeyStrings(in []FilterKey) []string {
	out := make([]string, len(in))
	for i, k := range in {
		out[i] = string(k)
	}
	sort.Strings(out)
	return out
}

// Validate checks p against def.Filters and returns either nil or a
// *ValidationError naming every offending key.
//
// Iteration order:
//   - Missing keys are appended in declaration order of def.Filters, so a
//     well-authored Report_Definition yields a deterministic Missing slice
//     even before Error() sorts it.
//   - Unsupported keys are appended in map-iteration order (non-deterministic
//     in Go); Error() sorts the rendered list.
//
// Validates Requirements 2.4, 2.5, 2.7.
func (Validator) Validate(def *ReportDefinition, p FilterPayload) error {
	if def == nil {
		return fmt.Errorf("master report: cannot validate filters against nil ReportDefinition")
	}

	declared := make(map[FilterKey]FilterControl, len(def.Filters))
	for _, fc := range def.Filters {
		declared[fc.Key] = fc
	}

	var missing []FilterKey
	for _, fc := range def.Filters {
		if !fc.Required {
			continue
		}
		v, ok := p[fc.Key]
		if !ok || isEmptyFilterValue(v) {
			missing = append(missing, fc.Key)
		}
	}

	var unsupported []FilterKey
	for k := range p {
		if _, ok := declared[k]; !ok {
			unsupported = append(unsupported, k)
		}
	}

	if len(missing) == 0 && len(unsupported) == 0 {
		return nil
	}
	return &ValidationError{Missing: missing, Unsupported: unsupported}
}

// isEmptyFilterValue applies the missing-value rules listed at the top of
// this file. Unknown types are treated as "supplied" rather than "missing"
// so the validator never falsely flags a key the user did pass.
//
// The trailing reflect.Value branch catches typed-nil interface values
// (e.g. var s []int = nil stored as `any`) that slip past the
// `v == nil` short-circuit because the interface itself is non-nil.
func isEmptyFilterValue(v any) bool {
	if v == nil {
		return true
	}
	switch x := v.(type) {
	case string:
		return x == ""
	case []int:
		return len(x) == 0
	case time.Time:
		return x.IsZero()
	case [2]time.Time:
		// A date_range is considered missing only when both endpoints are
		// the zero time. A partial range (one endpoint zero) is a
		// semantic problem, not a presence problem, and is the
		// DataSource's responsibility to reject.
		return x[0].IsZero() && x[1].IsZero()
	case int:
		// An int filter is treated as supplied even when 0; ids are not
		// guaranteed to be positive in every schema, and we should not
		// silently swallow a zero value the caller deliberately set.
		return false
	}

	// Defensive catch-all for typed nils (nil slice / map / pointer stored
	// in an `any`). reflect.Value.IsNil only accepts a subset of Kinds —
	// we guard the switch so it never panics on non-nilable kinds.
	rv := reflect.ValueOf(v)
	switch rv.Kind() {
	case reflect.Ptr, reflect.Interface, reflect.Slice, reflect.Map, reflect.Chan, reflect.Func:
		if rv.IsNil() {
			return true
		}
	}
	return false
}
