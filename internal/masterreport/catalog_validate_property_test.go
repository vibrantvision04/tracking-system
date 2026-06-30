package masterreport

// catalog_validate_property_test.go — task 14.3 (Property 14).
//
// Property 14: Catalog ↔ Permissions Coherence.
//
// For any *Catalog populated by registering N ∈ [1, 10] valid
// ReportDefinitions (each with a unique ReportID, a non-nil DataSource, and
// a PermissionKey of the canonical "reports.<id>.view" form),
// PermissionsForCatalog(catalog) must emit:
//
//   1. Exactly N*3 + 2 rows.
//   2. The two base rows ("reports.view", "reports.force_recalculate") at
//      the head of the slice, in that order.
//   3. For every registered ReportDefinition, exactly one
//      "reports.<id>.view", one "reports.<id>.export", and one
//      "reports.<id>.generate" row.
//   4. Every emitted row's CategoryID == CategoryReports (5).
//   5. The reverse direction: every per-report row's "reports.<id>.*" code
//      maps back to a registered ReportDefinition (no orphan permission
//      rows for retired reports, no permission row for an unregistered ID).
//
// A second property exercises the duplicate-id branch of MustRegister:
// re-registering the same ReportID must panic, fail-closed, so the boot
// path surfaces the misconfiguration before the HTTP server starts (Req
// 1.5, 1.8). Together the two properties cover the perturbation modes
// named in the task description — drop entry (a registered report missing
// from PermissionsForCatalog), duplicate id (re-registration), and miss
// permission row (a registered report not yielding the expected triple).
//
// Validates: Requirements 1.1, 1.5, 1.8, 8.1, 8.8

import (
	"context"
	"fmt"
	"sort"
	"testing"

	"pgregory.net/rapid"
)

// inertDataSource is a DataSource that never produces a real payload. It
// exists solely so MustRegister's "DataSource non-nil" guard accepts the
// drawn ReportDefinitions; Property 14 does not exercise the Compute path
// itself. The Compute / InputVersion bodies return inert values so an
// accidental call would surface as a clean assertion rather than a hang or
// a nil dereference.
type inertDataSource struct{}

func (inertDataSource) Compute(_ context.Context, _ FilterPayload, _ *BoundedWorkerPool) (Payload, error) {
	return Payload{}, nil
}

func (inertDataSource) InputVersion(_ context.Context, _ FilterPayload) (int64, error) {
	return 0, nil
}

// drawReportID returns a rapid-drawn ReportID that satisfies
// ReportID.Validate: 1..32 lowercase alphanumerics/underscores. The upper
// bound is well below MaxReportIDLength (64) so the generator never
// produces an oversize id that would shrink-fail every trial.
func drawReportID(rt *rapid.T, label string) ReportID {
	return ReportID(rapid.StringMatching(`[a-z0-9_]{1,32}`).Draw(rt, label))
}

// drawDistinctReportIDs returns n pairwise-distinct ReportIDs. rapid's
// SliceOfNDistinct could in principle be used here, but routing through
// drawReportID keeps the regex and length bound in a single place and
// makes the failure message clearer when an id fails to validate.
func drawDistinctReportIDs(rt *rapid.T, n int) []ReportID {
	seen := make(map[ReportID]struct{}, n)
	out := make([]ReportID, 0, n)
	// Bound the rejection loop so a pathological generator state cannot
	// hang the trial. 8x the requested size is generous — the alphabet
	// has 37 symbols and lengths up to 32, so collision pressure is
	// effectively zero for n ≤ 10.
	for attempts := 0; len(out) < n && attempts < 8*n+16; attempts++ {
		id := drawReportID(rt, fmt.Sprintf("report_id_%d_%d", len(out), attempts))
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	if len(out) < n {
		rt.Skipf("could not draw %d distinct report ids", n)
	}
	return out
}

// drawReportDefinition builds a valid *ReportDefinition for the given id.
// Every field MustRegister and the property assertions care about is
// populated: a non-nil DataSource, the canonical PermissionKey, a random
// Category drawn from AllCategories, and at least one optional
// FilterControl (the design allows zero filters but exercising the typical
// non-empty case stays closer to production registrations).
func drawReportDefinition(rt *rapid.T, id ReportID, idx int) *ReportDefinition {
	categories := AllCategories()
	category := rapid.SampledFrom(categories).Draw(rt, fmt.Sprintf("category_%d", idx))

	// One random optional FilterControl. The Property 14 test does not
	// inspect Filters; we populate it so the drawn definition is shaped
	// like a real registration rather than a degenerate empty schema.
	filterKey := rapid.SampledFrom(AllFilterKeys()).Draw(rt, fmt.Sprintf("filter_key_%d", idx))

	return &ReportDefinition{
		ID:            id,
		Name:          fmt.Sprintf("Report %s", id),
		Category:      category,
		Filters:       []FilterControl{{Key: filterKey, Required: false}},
		PermissionKey: fmt.Sprintf("reports.%s.view", id),
		DataSource:    inertDataSource{},
	}
}

// TestProperty14CatalogPermissionsCoherence asserts the forward and reverse
// directions of the catalog ↔ permissions invariant for any randomly
// populated Catalog.
//
// Validates: Requirements 1.1, 1.5, 1.8, 8.1, 8.8
func TestProperty14CatalogPermissionsCoherence(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		n := rapid.IntRange(1, 10).Draw(rt, "n_reports")
		ids := drawDistinctReportIDs(rt, n)

		// Build the canonical id set up front so the reverse-direction
		// check below can do O(1) membership lookups without iterating
		// the catalog again.
		registered := make(map[ReportID]struct{}, n)
		catalog := NewCatalog()
		for i, id := range ids {
			def := drawReportDefinition(rt, id, i)
			catalog.MustRegister(def)
			registered[id] = struct{}{}
		}

		perms := PermissionsForCatalog(catalog)

		// (1) Row count: 3 per registered report + 2 base rows.
		expectedLen := n*3 + 2
		if len(perms) != expectedLen {
			rt.Fatalf("PermissionsForCatalog: expected %d rows for n=%d reports, got %d", expectedLen, n, len(perms))
		}

		// (2) The two base rows lead the slice.
		if perms[0].Code != PermReportsViewBase {
			rt.Fatalf("PermissionsForCatalog: expected first row %q, got %q", PermReportsViewBase, perms[0].Code)
		}
		if perms[1].Code != PermReportsForceRecalculate {
			rt.Fatalf("PermissionsForCatalog: expected second row %q, got %q", PermReportsForceRecalculate, perms[1].Code)
		}

		// (4) Every emitted row sits in CategoryReports (5).
		for i, p := range perms {
			if p.CategoryID != CategoryReports {
				rt.Fatalf("PermissionsForCatalog[%d] (%s): CategoryID=%d, want %d", i, p.Code, p.CategoryID, CategoryReports)
			}
		}

		// (3, 5) Bucket per-report rows by ReportID and assert each
		// registered report owns exactly the {view, export, generate}
		// triple. Walking the slice once and indexing by id keeps the
		// reverse-direction check (every emitted reports.<id>.* code
		// maps to a registered report) in the same pass.
		perReport := make(map[ReportID]map[string]int, n)
		for i, p := range perms[2:] {
			// Recover the id and suffix from the code. Codes that do
			// not match "reports.<id>.<suffix>" indicate either an
			// orphan row (a permission for a retired report) or a
			// malformed code — both are property failures.
			id, suffix, ok := splitReportPermissionCode(p.Code)
			if !ok {
				rt.Fatalf("PermissionsForCatalog[%d]: code %q is not in the reports.<id>.<suffix> form", i+2, p.Code)
			}
			if _, exists := registered[id]; !exists {
				rt.Fatalf("PermissionsForCatalog[%d]: code %q references unregistered report id %q (orphan permission row)", i+2, p.Code, id)
			}
			bucket, ok := perReport[id]
			if !ok {
				bucket = make(map[string]int, 3)
				perReport[id] = bucket
			}
			bucket[suffix]++
		}

		// (3) For every registered report the triple is present and
		// each suffix appears exactly once.
		expectedSuffixes := []string{"view", "export", "generate"}
		for id := range registered {
			bucket, ok := perReport[id]
			if !ok {
				rt.Fatalf("PermissionsForCatalog: no permission rows emitted for registered report %q", id)
			}
			for _, suffix := range expectedSuffixes {
				count := bucket[suffix]
				if count != 1 {
					rt.Fatalf("PermissionsForCatalog: report %q has %d rows for suffix %q, expected 1", id, count, suffix)
				}
			}
			// Reject extra suffixes (e.g. a hypothetical reports.<id>.delete).
			if len(bucket) != len(expectedSuffixes) {
				gotSuffixes := make([]string, 0, len(bucket))
				for s := range bucket {
					gotSuffixes = append(gotSuffixes, s)
				}
				sort.Strings(gotSuffixes)
				rt.Fatalf("PermissionsForCatalog: report %q has %d distinct suffixes %v, expected exactly %v", id, len(bucket), gotSuffixes, expectedSuffixes)
			}
		}

		// Catalog.List reverse direction: every registered report is
		// reachable via Catalog.Get and the catalog reports the same
		// PermissionKey we registered. This guards against a future
		// refactor accidentally rewriting PermissionKey on registration
		// and silently breaking the "reports.<id>.view" reverse lookup.
		for _, def := range catalog.List() {
			got, ok := catalog.Get(def.ID)
			if !ok {
				rt.Fatalf("Catalog.Get(%q) returned ok=false for a registered report", def.ID)
			}
			expectedKey := fmt.Sprintf("reports.%s.view", def.ID)
			if got.PermissionKey != expectedKey {
				rt.Fatalf("Catalog.Get(%q).PermissionKey = %q, want %q", def.ID, got.PermissionKey, expectedKey)
			}
		}
	})
}

// TestProperty14DuplicateRegistrationPanics asserts that MustRegister
// panics when asked to register the same ReportID twice. This is the
// "duplicate id" perturbation mode named in the task description: the
// catalog must fail-closed at boot rather than silently accept the
// duplicate and emit a doubled permission triple.
//
// Validates: Requirements 1.1, 1.5, 1.8
func TestProperty14DuplicateRegistrationPanics(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		id := drawReportID(rt, "duplicate_id")
		catalog := NewCatalog()
		first := drawReportDefinition(rt, id, 0)
		catalog.MustRegister(first)

		// A second registration with the same id must panic.
		// Constructing a fresh ReportDefinition (rather than re-passing
		// `first`) confirms the duplicate check keys off ID alone — not
		// pointer identity.
		second := drawReportDefinition(rt, id, 1)

		defer func() {
			r := recover()
			if r == nil {
				rt.Fatalf("MustRegister: expected panic on duplicate id %q, got none", id)
			}
		}()
		catalog.MustRegister(second)
		// Unreachable: MustRegister must have panicked above.
		rt.Fatalf("MustRegister: returned normally on duplicate id %q", id)
	})
}

// splitReportPermissionCode parses a permission code of the form
// "reports.<id>.<suffix>" into its (<id>, <suffix>) pair. Returns ok=false
// for any code that does not match that exact shape — including the two
// base rows ("reports.view", "reports.force_recalculate") which the
// caller filters out before invoking this helper.
//
// We avoid pulling in `strings.Split` followed by manual reassembly so a
// ReportID that itself contains "." (which ReportID.Validate forbids, but
// the test still defends against) cannot confuse the parse: ReportIDs are
// drawn from [a-z0-9_], so the second '.' in the code is unambiguously
// the suffix delimiter.
func splitReportPermissionCode(code string) (ReportID, string, bool) {
	const prefix = "reports."
	if len(code) <= len(prefix) || code[:len(prefix)] != prefix {
		return "", "", false
	}
	rest := code[len(prefix):]
	// rest now looks like "<id>.<suffix>". Find the last '.' so an id
	// containing additional dots (forbidden by ReportID.Validate, but
	// kept robust here for defensive parsing) still parses correctly.
	dot := -1
	for i := len(rest) - 1; i >= 0; i-- {
		if rest[i] == '.' {
			dot = i
			break
		}
	}
	if dot <= 0 || dot == len(rest)-1 {
		return "", "", false
	}
	return ReportID(rest[:dot]), rest[dot+1:], true
}
