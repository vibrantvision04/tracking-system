// Package masterreport — smoke test for boot-time RBAC seeding completeness.
//
// This test mirrors the catalog wiring performed by cmd/server/main.go
// (task 14.2) but substitutes a no-op compute closure so the assertions
// can run as a pure unit test without spinning up a database. Once every
// reports_*.go Register helper has fired against the local Catalog,
// PermissionsForCatalog must emit the full permission row set the
// application seeds into the `permissions` table on boot:
//
//   - 27 registered reports × 3 codes each (view, export, generate)
//   - PLUS the two base rows (`reports.view`, `reports.force_recalculate`)
//   - = 83 rows total, all under CategoryID = CategoryReports (5).
//
// The smoke test guards against a regression where adding a new report
// to reports_*.go without re-running the boot path would silently leave
// the per-report permission triple unseeded — the kind of drift that
// only manifests in production when an admin tries to grant the missing
// permission on the Role Management UI.
//
// Validates: Requirements 8.1, 8.2, 8.8 (RBAC seeding completeness).
package masterreport

import (
	"context"
	"fmt"
	"testing"
	"time"
)

// buildSmokeCatalog mirrors the wiring in cmd/server/main.go (the
// "13b. Master Reporting Module" block) but with a no-op compute closure.
// Adapter constructors store these closures without dereferencing, so
// the registered DataSource interface values satisfy MustRegister's
// non-nil check; the placeholders only matter if anyone calls Compute or
// InputVersion, which this test never does.
//
// Keep this list in sync with cmd/server/main.go. If a new report is
// added there, mirror it here and update wantReportCount below.
func buildSmokeCatalog(t *testing.T) *Catalog {
	t.Helper()

	catalog := NewCatalog()

	placeholderCompute := func(_ context.Context, _ FilterPayload, _ *BoundedWorkerPool) (Payload, error) {
		now := time.Now().UTC()
		return Payload{
			Rows:         []map[string]any{},
			GeneratedAt:  now,
			InputVersion: now.UnixMilli(),
		}, nil
	}

	// 27 reports in display-order, matching docs/master-reports-catalog.md.
	RegisterRoadSweeping(catalog, placeholderCompute, nil)
	RegisterOpenDepotGVPShift3(catalog, placeholderCompute, nil)
	RegisterTSPointReached0730(catalog, placeholderCompute, nil)
	RegisterHelperAttendance(catalog, placeholderCompute, nil)
	RegisterHelperAttendanceSummary(catalog, placeholderCompute, nil)
	RegisterTSPointReached(catalog, placeholderCompute, nil)
	RegisterGovtStreetSweeperAttendance(catalog, placeholderCompute, nil)
	RegisterStreetSweeperSummary(catalog, placeholderCompute, nil)
	RegisterOpenDepotGVPShift1(catalog, placeholderCompute, nil)
	RegisterActiveHoppersSummary(catalog, placeholderCompute, nil)
	RegisterEarlyDepartureD2D(catalog, placeholderCompute, nil)
	RegisterOpenDepotGVPShift2(catalog, placeholderCompute, nil)
	RegisterD2DVehicleCoverage(catalog, placeholderCompute, nil)
	RegisterD2DZoneSummary(catalog, placeholderCompute, nil)
	RegisterStreetSweepingDetail(catalog, placeholderCompute, nil)
	RegisterStreetSweepingSummary(catalog, placeholderCompute, nil)
	RegisterD2DWorkingCheck(catalog, placeholderCompute, nil)
	RegisterCommercialHopperSummary(catalog, placeholderCompute, nil)
	RegisterSafaiKaramchariWorked(catalog, placeholderCompute, nil)
	RegisterBeetSweepingSummary(catalog, placeholderCompute, nil)
	RegisterGTSTrip(catalog, placeholderCompute, nil)
	RegisterWeightBridgeReport(catalog, placeholderCompute, nil)
	RegisterRFIDCollection(catalog, placeholderCompute, nil)
	RegisterEveningD2DCheck(catalog, placeholderCompute, nil)
	RegisterEveningCommercialDetail(catalog, placeholderCompute, nil)
	RegisterEveningCommercialSummary(catalog, placeholderCompute, nil)
	RegisterDailyMasterConsolidated(catalog, placeholderCompute, nil)

	return catalog
}

// wantReportCount is the expected number of registered reports in the
// v1 catalog (docs/master-reports-catalog.md). Keep in sync with
// buildSmokeCatalog and cmd/server/main.go.
const wantReportCount = 27

// TestRBACSeedingSmoke asserts the full PermissionsForCatalog output
// shape against a populated 27-report catalog (Req 8.1, 8.2, 8.8). It
// is the regression guard for the RBAC seeding contract: any change
// that adds a report without seeding its permission triple, or that
// perturbs the category / code shape of the base rows, surfaces here.
//
// The name matches the verify filter used by the task plan
// (`-run='TestPermissionsForCatalog|TestRBACSeedingSmoke'`) so this
// smoke check is exercised whenever the targeted re-run is invoked.
func TestRBACSeedingSmoke(t *testing.T) {
	catalog := buildSmokeCatalog(t)

	defs := catalog.List()
	if got := len(defs); got != wantReportCount {
		t.Fatalf("catalog registration count: got %d reports, want %d (sync buildSmokeCatalog with cmd/server/main.go)", got, wantReportCount)
	}

	perms := PermissionsForCatalog(catalog)

	// Total row count: 27 reports × 3 codes (view/export/generate)
	// + 2 base rows (reports.view, reports.force_recalculate) = 83.
	const wantTotal = wantReportCount*3 + 2
	if got := len(perms); got != wantTotal {
		t.Fatalf("PermissionsForCatalog row count: got %d, want %d", got, wantTotal)
	}

	// Index by code for the per-report and base-row assertions. The
	// duplicate-code check (no two rows share a Code) folds naturally
	// into the index build: a second insert for the same key indicates
	// a generation bug in PermissionsForCatalog.
	byCode := make(map[string]int, len(perms))
	for i, p := range perms {
		if prev, ok := byCode[p.Code]; ok {
			t.Errorf("duplicate Code %q at indices %d and %d", p.Code, prev, i)
			continue
		}
		byCode[p.Code] = i
	}

	// Every row must be filed under the Reports category (Req 8.8).
	// A miscategorised row would surface in the wrong section of the
	// Role Management UI and bypass the per-section grant controls.
	for i, p := range perms {
		if p.CategoryID != CategoryReports {
			t.Errorf("perms[%d].CategoryID = %d, want %d (Code=%q)", i, p.CategoryID, CategoryReports, p.Code)
		}
	}

	// Base rows must be present. These gate the catalog menu and the
	// force-recompute action respectively (Req 7.5, 8.2).
	for _, want := range []string{PermReportsViewBase, PermReportsForceRecalculate} {
		if _, ok := byCode[want]; !ok {
			t.Errorf("missing base permission row %q", want)
		}
	}

	// Per-report triples. For each registered ReportDefinition the
	// generator must emit exactly reports.<id>.view, reports.<id>.export,
	// and reports.<id>.generate. Anything else in the byCode map after
	// removing the triples + base rows is unexpected fan-out.
	for _, def := range defs {
		for _, suffix := range []string{"view", "export", "generate"} {
			want := fmt.Sprintf("reports.%s.%s", def.ID, suffix)
			if _, ok := byCode[want]; !ok {
				t.Errorf("missing per-report permission row %q", want)
			}
		}
	}

	// Cross-check: the index size matches the slice length, which —
	// combined with the duplicate guard above — proves the slice
	// contains no repeated codes.
	if len(byCode) != len(perms) {
		t.Errorf("unique-code count %d ≠ total row count %d (some Code values collided)", len(byCode), len(perms))
	}
}
