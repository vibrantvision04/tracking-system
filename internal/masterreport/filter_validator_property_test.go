package masterreport

// filter_validator_property_test.go — task 4.4 (Property 2).
//
// Property 2: FilterValidator Rejection Completeness.
//
// For any Report_Definition def whose Filter_Schema is drawn from the closed
// FilterKey enum and any FilterPayload p constructed by:
//
//   (a) randomly dropping zero or more required keys declared by def, and
//   (b) randomly adding zero or more keys not declared by def (drawn either
//       from the FilterKey enum complement of def.Filters or from arbitrary
//       strings cast to FilterKey),
//
// Validator.Validate(def, p) must:
//
//   1. Return *ValidationError iff at least one offending key exists.
//   2. Name every dropped required key in ValidationError.Missing (no
//      omissions, no duplicates, no extras).
//   3. Name every added non-schema key in ValidationError.Unsupported (no
//      omissions, no duplicates, no extras).
//   4. Never invoke the report's DataSource — the validator is purely a
//      key-shape gate (Req 2.7).
//
// The DataSource invariant (4) is enforced by binding an instrumented
// recorderDataSource to def and asserting its Compute / InputVersion
// counters remain zero after every Validate call across every rapid trial.
//
// Validates: Requirements 2.4, 2.5

import (
	"context"
	"sort"
	"sync/atomic"
	"testing"

	"pgregory.net/rapid"
)

// recorderDataSource is a DataSource whose Compute and InputVersion methods
// bump atomic counters on every call. The Property 2 test asserts both
// counters remain zero after Validator.Validate, regardless of payload —
// confirming the validator gate runs entirely above the DataSource layer.
//
// recorderDataSource is intentionally inert: Compute returns a zero Payload
// and a nil error so the test never depends on its body; the only
// observable signal is the atomic call count.
type recorderDataSource struct {
	computeCalls atomic.Int64
	versionCalls atomic.Int64
}

func (r *recorderDataSource) Compute(_ context.Context, _ FilterPayload, _ *BoundedWorkerPool) (Payload, error) {
	r.computeCalls.Add(1)
	return Payload{}, nil
}

func (r *recorderDataSource) InputVersion(_ context.Context, _ FilterPayload) (int64, error) {
	r.versionCalls.Add(1)
	return 0, nil
}

// TestFilterValidatorRejectionCompleteness is Property 2 from the
// master-consolidated-reporting spec.
//
// Validates: Requirements 2.4, 2.5
func TestFilterValidatorRejectionCompleteness(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		all := AllFilterKeys()

		// Partition the closed FilterKey enum into (declared, undeclared)
		// by drawing a random permutation and slicing at a random cut. The
		// declared prefix becomes the Report_Definition's Filter_Schema;
		// the undeclared suffix is a pool of well-known non-schema keys
		// the payload may add.
		perm := rapid.Permutation(all).Draw(rt, "key_permutation")
		nDeclared := rapid.IntRange(1, len(all)).Draw(rt, "n_declared")
		declared := perm[:nDeclared]
		undeclared := perm[nDeclared:]

		// Build the Filter_Schema: each declared key is independently
		// marked required or optional so a single rapid trial exercises
		// both branches of the missing-key rule.
		filters := make([]FilterControl, len(declared))
		requiredSet := make(map[FilterKey]struct{}, len(declared))
		for i, k := range declared {
			required := rapid.Bool().Draw(rt, "required_"+string(k))
			filters[i] = FilterControl{Key: k, Required: required}
			if required {
				requiredSet[k] = struct{}{}
			}
		}

		ds := &recorderDataSource{}
		def := &ReportDefinition{
			ID:            ReportID("filter_validator_rejection_completeness"),
			Name:          "Filter Validator Rejection Completeness",
			Category:      CategoryConsolidated,
			PermissionKey: "reports.filter_validator_rejection_completeness.view",
			Filters:       filters,
			DataSource:    ds,
		}

		// Build the payload and the expected offender sets in lockstep so
		// the test oracle and the validator see the same construction.
		payload := FilterPayload{}
		expectedMissing := make(map[FilterKey]struct{})
		expectedUnsupported := make(map[FilterKey]struct{})

		// Declared keys: independently choose whether each one ends up in
		// the payload. A dropped required key is a "missing" offender; a
		// dropped optional key is a no-op; an included key supplies a
		// non-empty value so the validator never flags it as missing.
		for _, fc := range filters {
			include := rapid.Bool().Draw(rt, "include_"+string(fc.Key))
			if include {
				payload[fc.Key] = "x"
				continue
			}
			if fc.Required {
				expectedMissing[fc.Key] = struct{}{}
			}
		}

		// Non-schema keys, source 1: the closed-enum complement of
		// `declared`. Adding any of these keys yields an "unsupported"
		// offender because the schema did not declare them.
		for _, k := range undeclared {
			if rapid.Bool().Draw(rt, "add_undeclared_"+string(k)) {
				payload[k] = "x"
				expectedUnsupported[k] = struct{}{}
			}
		}

		// Non-schema keys, source 2: arbitrary strings cast to FilterKey
		// that fall outside the closed enum entirely. This exercises the
		// "key in p not declared in def.Filters" branch of the validator
		// for keys it has never seen, not just enum members the schema
		// happened to omit.
		extraN := rapid.IntRange(0, 3).Draw(rt, "extra_n")
		for i := 0; i < extraN; i++ {
			name := rapid.StringMatching(`__extra_[a-z]{1,8}_[0-9]`).Draw(rt, "extra_name")
			ek := FilterKey(name)
			// Skip the (vanishingly rare) collision with a declared key.
			// The __extra_ prefix already makes collisions impossible
			// against the current FilterKey constants, but the guard
			// keeps the test correct if the enum ever grows.
			if _, declared := requiredSet[ek]; declared {
				continue
			}
			collidesDeclared := false
			for _, fc := range filters {
				if fc.Key == ek {
					collidesDeclared = true
					break
				}
			}
			if collidesDeclared {
				continue
			}
			payload[ek] = "x"
			expectedUnsupported[ek] = struct{}{}
		}

		// Act.
		err := Validator{}.Validate(def, payload)

		// Invariant 4: the validator never invokes the data source under
		// any payload shape. Checked first so a regression in this guard
		// surfaces before the key-set mismatch noise.
		if got := ds.computeCalls.Load(); got != 0 {
			rt.Fatalf("Validator invoked DataSource.Compute %d times; expected 0 (payload=%v)", got, payload)
		}
		if got := ds.versionCalls.Load(); got != 0 {
			rt.Fatalf("Validator invoked DataSource.InputVersion %d times; expected 0 (payload=%v)", got, payload)
		}

		// Invariant 1: nil iff no offenders.
		if len(expectedMissing) == 0 && len(expectedUnsupported) == 0 {
			if err != nil {
				rt.Fatalf("expected nil error when no offenders; got %v (payload=%v, filters=%v)", err, payload, filters)
			}
			return
		}
		if err == nil {
			rt.Fatalf(
				"expected *ValidationError; got nil\n  expectedMissing=%v\n  expectedUnsupported=%v\n  payload=%v\n  filters=%v",
				sortedFilterKeys(expectedMissing), sortedFilterKeys(expectedUnsupported), payload, filters,
			)
		}

		ve, ok := err.(*ValidationError)
		if !ok {
			rt.Fatalf("expected *ValidationError; got %T: %v", err, err)
		}

		// Invariants 2 and 3: Missing and Unsupported name every offender
		// exactly once, with no extras. We compare as sets to keep the
		// property independent of slice ordering (the validator does not
		// promise an order on Unsupported because Go map iteration is
		// randomised).
		gotMissing := filterKeySet(ve.Missing)
		gotUnsupported := filterKeySet(ve.Unsupported)

		if !filterKeySetsEqual(gotMissing, expectedMissing) {
			rt.Fatalf(
				"ValidationError.Missing mismatch:\n  got=%v\n  want=%v\n  payload=%v\n  filters=%v",
				sortedFilterKeys(gotMissing), sortedFilterKeys(expectedMissing), payload, filters,
			)
		}
		if !filterKeySetsEqual(gotUnsupported, expectedUnsupported) {
			rt.Fatalf(
				"ValidationError.Unsupported mismatch:\n  got=%v\n  want=%v\n  payload=%v\n  filters=%v",
				sortedFilterKeys(gotUnsupported), sortedFilterKeys(expectedUnsupported), payload, filters,
			)
		}

		// Also assert the slices themselves contain no duplicates — a
		// regression where the validator appended the same key twice
		// would still pass the set comparison above but break downstream
		// HTTP response shape.
		if len(ve.Missing) != len(gotMissing) {
			rt.Fatalf("ValidationError.Missing contains duplicates: slice=%v set=%v", ve.Missing, sortedFilterKeys(gotMissing))
		}
		if len(ve.Unsupported) != len(gotUnsupported) {
			rt.Fatalf("ValidationError.Unsupported contains duplicates: slice=%v set=%v", ve.Unsupported, sortedFilterKeys(gotUnsupported))
		}
	})
}

// filterKeySet collects a []FilterKey into a set for order-independent
// comparison with the expected offender set.
func filterKeySet(keys []FilterKey) map[FilterKey]struct{} {
	out := make(map[FilterKey]struct{}, len(keys))
	for _, k := range keys {
		out[k] = struct{}{}
	}
	return out
}

// filterKeySetsEqual reports whether two FilterKey sets contain exactly the
// same elements.
func filterKeySetsEqual(a, b map[FilterKey]struct{}) bool {
	if len(a) != len(b) {
		return false
	}
	for k := range a {
		if _, ok := b[k]; !ok {
			return false
		}
	}
	return true
}

// sortedFilterKeys returns a lexicographically sorted []string view of the
// given set. Used for deterministic failure messages so a counter-example
// reads the same way on every run.
func sortedFilterKeys(set map[FilterKey]struct{}) []string {
	out := make([]string, 0, len(set))
	for k := range set {
		out = append(out, string(k))
	}
	sort.Strings(out)
	return out
}
