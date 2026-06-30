// Package api — Property 9 RBAC Enforcement Completeness (task 15.4).
//
// This file validates the contract between the principal's permission set
// and the master-report HTTP endpoints. The property is asserted against
// the SAME middleware chain that router.go wires onto each endpoint:
//
//	r.With(h.RequirePermission("reports.view")).Get("/master-reports/catalog", ...)
//	r.With(h.requireReportPermission("view")).Post("/master-reports/{report_id}/generate", ...)
//	r.With(h.requireReportPermission("view")).
//	  With(h.RequirePermission("reports.force_recalculate")).
//	  Post("/master-reports/{report_id}/recalculate", ...)
//	r.With(h.requireReportPermission("view")).Get("/master-reports/{report_id}/export.xlsx", ...)
//	r.With(h.requireReportPermission("view")).Get("/master-reports/{report_id}/export.pdf", ...)
//
// The downstream handlers are stubbed with a 200-returning okHandler so the
// test focuses purely on RBAC enforcement: a 403 from the middleware never
// reaches the stub, and any non-403 response with the stub installed means
// the middleware let the request through. This isolates Property 9 from
// the inner correctness of GenerateReport / ExportExcel / etc., which are
// covered by their own tests.
//
// The rbacChecker injected via Handler.rbacCheckOverride lets the test
// answer permission queries deterministically from a generated permission
// set, sparing the suite a real Postgres instance.
//
// Validates: Requirements 1.6, 7.4, 8.3, 8.4, 8.5, 8.7
package api

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"pgregory.net/rapid"

	"gps-tracking-system/internal/auth"
	"gps-tracking-system/internal/masterreport"
)

// -----------------------------------------------------------------------------
// Test fixtures
// -----------------------------------------------------------------------------

// rbacTestReportIDs is the fixed set of report IDs the property test
// exercises. Each is a valid masterreport.ReportID (lowercase ASCII +
// underscore, ≤ MaxReportIDLength) so requireReportPermission's regex
// gate cannot misfire and produce a 400 instead of the 403/200 outcome
// the property assertions care about. The set deliberately spans
// several categories (sweeping, depot, RFID, weighbridge, deployment,
// active vehicle, alerts) so the property covers heterogeneous keys
// rather than a single family.
var rbacTestReportIDs = []string{
	"road_sweeping",
	"open_depot_gvp_shift_3",
	"helper_attendance",
	"rfid_collection",
	"gts_trip",
	"weight_bridge_report",
	"active_hoppers_summary",
	"d2d_working_check",
	"d2d_vehicle_coverage",
	"daily_master_consolidated",
}

// fakeRBAC is an in-memory rbacChecker. It rejects super-admin status so
// the test exercises the permission-grant path exclusively (super-admin
// bypass is a separate code path with no per-permission variation, and
// its 200 response would mask any defect in the permission lookup
// itself). HasPermission checks set membership; GetUserPermissions
// returns the held set verbatim — both are deterministic given the
// generated permission set.
type fakeRBAC struct {
	perms map[string]struct{}
}

func newFakeRBAC(held []string) *fakeRBAC {
	m := make(map[string]struct{}, len(held))
	for _, p := range held {
		m[p] = struct{}{}
	}
	return &fakeRBAC{perms: m}
}

func (f *fakeRBAC) IsSuperAdmin(ctx context.Context, userID int) (bool, error) {
	return false, nil
}

func (f *fakeRBAC) HasPermission(ctx context.Context, userID int, code string) (bool, error) {
	_, ok := f.perms[code]
	return ok, nil
}

func (f *fakeRBAC) GetUserPermissions(ctx context.Context, userID int) ([]string, error) {
	out := make([]string, 0, len(f.perms))
	for k := range f.perms {
		out = append(out, k)
	}
	sort.Strings(out)
	return out, nil
}

// rbacTestMarker is set by the stub okHandler so callers can disambiguate
// "middleware allowed the request through" from "middleware sent a 200
// itself". A 200 response with this header means the request reached the
// stub; absence of the header (combined with the response status) means
// the middleware short-circuited.
const rbacTestMarker = "X-RBAC-Test-Allowed"

// buildRBACTestRouter wires the same middleware chain used by router.go
// for the master-report endpoints, but routes every endpoint to a stub
// 200 handler so the test isolates RBAC enforcement from inner handler
// logic. Adding new master-report routes to router.go that should be
// covered by Property 9 requires a matching addition here.
func buildRBACTestRouter(h *Handler) http.Handler {
	stub := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set(rbacTestMarker, "1")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	r := chi.NewRouter()
	// Catalog: gated on `reports.view` (the Base_Permission).
	r.With(h.RequirePermission("reports.view")).Get("/api/master-reports/catalog", stub.ServeHTTP)
	// Generate / Export-xlsx / Export-pdf: gated on per-report `reports.<id>.view`.
	r.With(h.requireReportPermission("view")).Post("/api/master-reports/{report_id}/generate", stub.ServeHTTP)
	r.With(h.requireReportPermission("view")).Get("/api/master-reports/{report_id}/export.xlsx", stub.ServeHTTP)
	r.With(h.requireReportPermission("view")).Get("/api/master-reports/{report_id}/export.pdf", stub.ServeHTTP)
	// Force_Recalculate: gated on BOTH per-report view AND admin recalc.
	r.With(h.requireReportPermission("view")).
		With(h.RequirePermission("reports.force_recalculate")).
		Post("/api/master-reports/{report_id}/recalculate", stub.ServeHTTP)
	// Jobs: gated on `reports.view` (job ownership is checked at handler level).
	r.With(h.RequirePermission("reports.view")).Get("/api/master-reports/jobs/{job_id}", stub.ServeHTTP)

	return r
}

// authedRequest builds a request with an authenticated claims context so
// RequirePermission sees a logged-in user. The user ID is fixed at 1; the
// permission set is keyed by code, not user ID, so the value is
// inconsequential.
func authedRequest(method, target string) *http.Request {
	req := httptest.NewRequest(method, target, nil)
	claims := &auth.Claims{UserID: 1, Email: "rbac-test@example.com", Role: "user", Type: "access"}
	ctx := context.WithValue(req.Context(), userClaimsKey, claims)
	return req.WithContext(ctx)
}

// drawHeldPermissions samples a random principal permission set: a subset
// of per-report `reports.<id>.view` keys plus optional admin keys. Each
// key is included with independent 50% probability so the generator
// covers the full power-set distribution across runs.
func drawHeldPermissions(rt *rapid.T) []string {
	held := make([]string, 0)
	for _, rid := range rbacTestReportIDs {
		if rapid.Bool().Draw(rt, "view_"+rid) {
			held = append(held, "reports."+rid+".view")
		}
		// Per Property 9 claim (d), an export-specific permission MUST
		// NOT be required. We still generate `reports.<id>.export`
		// rows occasionally so any future regression that starts
		// gating exports on them is surfaced as a flake-free failure
		// against the held set's deliberate absence of view.
		if rapid.Bool().Draw(rt, "export_"+rid) {
			held = append(held, "reports."+rid+".export")
		}
		if rapid.Bool().Draw(rt, "generate_"+rid) {
			held = append(held, "reports."+rid+".generate")
		}
	}
	if rapid.Bool().Draw(rt, "reports_view_base") {
		held = append(held, "reports.view")
	}
	if rapid.Bool().Draw(rt, "force_recalculate") {
		held = append(held, "reports.force_recalculate")
	}
	return held
}

// hasPerm is a small membership helper that keeps test assertions
// readable.
func hasPerm(held []string, code string) bool {
	for _, h := range held {
		if h == code {
			return true
		}
	}
	return false
}

// describePerms renders the permission set as a sorted comma-separated
// string for failure messages. Sorting keeps the message stable across
// runs and makes shrinking output deterministic.
func describePerms(held []string) string {
	cp := append([]string(nil), held...)
	sort.Strings(cp)
	return strings.Join(cp, ",")
}

// -----------------------------------------------------------------------------
// Property 9 — RBAC Enforcement Completeness
// -----------------------------------------------------------------------------

// TestProperty9RBACEnforcementCompleteness verifies the four claims of
// Property 9 across randomised permission sets:
//
//  1. Generate, Export-Excel, Export-PDF return 403 iff the principal
//     does NOT hold `reports.<id>.view`.
//  2. Force_Recalculate returns 403 iff the principal does NOT hold
//     BOTH `reports.<id>.view` AND `reports.force_recalculate`.
//  3. When the principal holds `reports.<id>.view`, Export-Excel and
//     Export-PDF are accepted with no separate export permission.
//  4. Holding `reports.<id>.export` alone, without `.view`, is NOT
//     sufficient to access any endpoint (the export key is gated by
//     view, not by itself).
//
// Validates: Requirements 1.6, 7.4, 8.3, 8.4, 8.5, 8.7
func TestProperty9RBACEnforcementCompleteness(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		held := drawHeldPermissions(rt)
		h := &Handler{rbacCheckOverride: newFakeRBAC(held)}
		srv := buildRBACTestRouter(h)

		rid := rapid.SampledFrom(rbacTestReportIDs).Draw(rt, "report_id")
		viewCode := "reports." + rid + ".view"
		holdsView := hasPerm(held, viewCode)
		holdsForce := hasPerm(held, "reports.force_recalculate")

		// ----- Claim 1a: Generate gated on view -----
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, authedRequest("POST", "/api/master-reports/"+rid+"/generate"))
		assertRBACOutcome(rt, "Generate", rid, w, holdsView, held)

		// ----- Claim 1b: Export-Excel gated on view -----
		w = httptest.NewRecorder()
		srv.ServeHTTP(w, authedRequest("GET", "/api/master-reports/"+rid+"/export.xlsx"))
		assertRBACOutcome(rt, "ExportExcel", rid, w, holdsView, held)

		// ----- Claim 1c: Export-PDF gated on view -----
		w = httptest.NewRecorder()
		srv.ServeHTTP(w, authedRequest("GET", "/api/master-reports/"+rid+"/export.pdf"))
		assertRBACOutcome(rt, "ExportPDF", rid, w, holdsView, held)

		// ----- Claim 2: Force_Recalculate gated on view AND force_recalculate -----
		w = httptest.NewRecorder()
		srv.ServeHTTP(w, authedRequest("POST", "/api/master-reports/"+rid+"/recalculate"))
		assertRBACOutcome(rt, "ForceRecalculate", rid, w, holdsView && holdsForce, held)

		// ----- Claim 3 (positive form): exports accepted with only .view -----
		// When the principal holds view but neither export nor generate
		// keys, the two export endpoints MUST still succeed. We
		// re-run the chain with a permission set scrubbed of all
		// .export / .generate keys to make the assertion explicit.
		if holdsView {
			scrubbed := []string{viewCode}
			if holdsForce {
				scrubbed = append(scrubbed, "reports.force_recalculate")
			}
			h2 := &Handler{rbacCheckOverride: newFakeRBAC(scrubbed)}
			srv2 := buildRBACTestRouter(h2)

			w = httptest.NewRecorder()
			srv2.ServeHTTP(w, authedRequest("GET", "/api/master-reports/"+rid+"/export.xlsx"))
			if w.Code == http.StatusForbidden {
				rt.Fatalf("Property 9 claim (d) violated: ExportExcel denied 403 for principal holding only %q (no .export, no .generate)", viewCode)
			}
			if w.Header().Get(rbacTestMarker) != "1" {
				rt.Fatalf("Property 9 claim (d) violated: ExportExcel did not reach stub for principal holding only %q (status=%d)", viewCode, w.Code)
			}

			w = httptest.NewRecorder()
			srv2.ServeHTTP(w, authedRequest("GET", "/api/master-reports/"+rid+"/export.pdf"))
			if w.Code == http.StatusForbidden {
				rt.Fatalf("Property 9 claim (d) violated: ExportPDF denied 403 for principal holding only %q (no .export, no .generate)", viewCode)
			}
			if w.Header().Get(rbacTestMarker) != "1" {
				rt.Fatalf("Property 9 claim (d) violated: ExportPDF did not reach stub for principal holding only %q (status=%d)", viewCode, w.Code)
			}
		}

		// ----- Claim 4: export-only permission is NOT sufficient -----
		// A principal holding only `reports.<id>.export` (without
		// `.view`) MUST be rejected with 403 on every per-report
		// endpoint. This guards against a regression where a future
		// router edit accidentally checks `.export` instead of
		// `.view` for the export endpoints.
		exportOnly := []string{"reports." + rid + ".export"}
		h3 := &Handler{rbacCheckOverride: newFakeRBAC(exportOnly)}
		srv3 := buildRBACTestRouter(h3)
		for _, ep := range []struct {
			method, path, label string
		}{
			{"POST", "/api/master-reports/" + rid + "/generate", "Generate"},
			{"GET", "/api/master-reports/" + rid + "/export.xlsx", "ExportExcel"},
			{"GET", "/api/master-reports/" + rid + "/export.pdf", "ExportPDF"},
			{"POST", "/api/master-reports/" + rid + "/recalculate", "ForceRecalculate"},
		} {
			w := httptest.NewRecorder()
			srv3.ServeHTTP(w, authedRequest(ep.method, ep.path))
			if w.Code != http.StatusForbidden {
				rt.Fatalf("Property 9 export-only check violated: %s on %q permitted with only .export key (status=%d, held=%v)", ep.label, rid, w.Code, exportOnly)
			}
		}
	})
}

// assertRBACOutcome encodes the property's bidirectional implication:
// allowed iff principal holds the required permission. A non-403 response
// without the stub marker indicates the middleware committed a status
// other than 403 (e.g., 400 from an invalid report ID) — that path is a
// distinct failure mode and we surface it with a clear message.
func assertRBACOutcome(rt *rapid.T, endpoint, reportID string, w *httptest.ResponseRecorder, expectAllow bool, held []string) {
	rt.Helper()
	if expectAllow {
		if w.Code == http.StatusForbidden {
			rt.Fatalf("%s on %q expected ALLOW but got 403; held=[%s]", endpoint, reportID, describePerms(held))
		}
		if w.Header().Get(rbacTestMarker) != "1" {
			rt.Fatalf("%s on %q expected ALLOW but middleware short-circuited (status=%d); held=[%s]", endpoint, reportID, w.Code, describePerms(held))
		}
		return
	}
	// Expected: 403.
	if w.Code != http.StatusForbidden {
		rt.Fatalf("%s on %q expected 403 but got %d; held=[%s]", endpoint, reportID, w.Code, describePerms(held))
	}
	if w.Header().Get(rbacTestMarker) == "1" {
		rt.Fatalf("%s on %q expected 403 but request reached stub handler (status=%d); held=[%s]", endpoint, reportID, w.Code, describePerms(held))
	}
}

// -----------------------------------------------------------------------------
// Property 9 — Catalog membership iff `reports.<id>.view`
// -----------------------------------------------------------------------------

// TestProperty9CatalogContainsReportIffViewHeld verifies the catalog claim
// of Property 9: a report R is present in the catalog returned to
// principal P iff P holds `reports.<R.report_id>.view`. The assertion is
// made directly against Catalog.FilterByPrincipal — the same primitive
// the GetCatalog handler delegates to — so this property is independent
// of the HTTP transport.
//
// Validates: Requirements 1.6, 8.7
func TestProperty9CatalogContainsReportIffViewHeld(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		// Build a fresh catalog seeded with stub ReportDefinitions for
		// each test report ID. The DataSource is a no-op stub
		// (Compute / InputVersion are never invoked by
		// FilterByPrincipal); permission keys follow the canonical
		// `reports.<id>.view` shape from Req 8.1.
		catalog := masterreport.NewCatalog()
		for _, rid := range rbacTestReportIDs {
			def := &masterreport.ReportDefinition{
				ID:            masterreport.ReportID(rid),
				Name:          rid,
				Category:      masterreport.CategoryConsolidated,
				DataSource:    noopDataSource{},
				PermissionKey: "reports." + rid + ".view",
			}
			catalog.MustRegister(def)
		}

		// Draw a random principal permission set restricted to view
		// keys (the only ones that affect catalog filtering). Other
		// keys are irrelevant per Req 1.6 and are deliberately
		// excluded so failure shrinking pins on the relevant subset.
		held := make([]string, 0, len(rbacTestReportIDs))
		for _, rid := range rbacTestReportIDs {
			if rapid.Bool().Draw(rt, "view_"+rid) {
				held = append(held, "reports."+rid+".view")
			}
		}

		filtered := catalog.FilterByPrincipal(held)
		seen := make(map[string]bool, len(filtered))
		for _, d := range filtered {
			seen[string(d.ID)] = true
		}

		for _, rid := range rbacTestReportIDs {
			viewCode := "reports." + rid + ".view"
			holdsView := hasPerm(held, viewCode)
			present := seen[rid]
			if holdsView && !present {
				rt.Fatalf("catalog missing %q for principal holding %q; held=[%s]", rid, viewCode, describePerms(held))
			}
			if !holdsView && present {
				rt.Fatalf("catalog contains %q for principal NOT holding %q; held=[%s]", rid, viewCode, describePerms(held))
			}
		}
	})
}

// noopDataSource satisfies masterreport.DataSource without ever computing.
// FilterByPrincipal only reads PermissionKey; Compute / InputVersion are
// never invoked along the catalog-filter path, so panicking here would
// surface any future regression that started calling them at filter time.
type noopDataSource struct{}

func (noopDataSource) Compute(ctx context.Context, f masterreport.FilterPayload, pool *masterreport.BoundedWorkerPool) (masterreport.Payload, error) {
	return masterreport.Payload{}, fmt.Errorf("noopDataSource.Compute should never be invoked from a catalog-filter test")
}

func (noopDataSource) InputVersion(ctx context.Context, f masterreport.FilterPayload) (int64, error) {
	return 0, fmt.Errorf("noopDataSource.InputVersion should never be invoked from a catalog-filter test")
}
