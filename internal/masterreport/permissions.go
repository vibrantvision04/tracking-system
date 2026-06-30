// Package masterreport contains the Master Consolidated Reporting Module.
//
// This file builds the boot-time permission seeding payload for the module.
// PermissionsForCatalog walks the registered ReportDefinitions and emits one
// `reports.<id>.view`, one `reports.<id>.export`, and one
// `reports.<id>.generate` row per report, plus the two category-level base
// rows (`reports.view` and `reports.force_recalculate`) that gate the
// catalog as a whole.
//
// The returned slice is fed to
// repository.RBACRepository.RegisterPermissions in cmd/server/main.go (task
// 14.2). RegisterPermissions issues `INSERT ... ON CONFLICT (code) DO
// NOTHING`, which makes the call idempotent across reboots and safe to run
// alongside the existing api.RegisterAllPermissions seeding (Req 8.1, 8.8).
//
// Requirements covered: 8.1, 8.2, 8.8.
package masterreport

import (
	"fmt"

	"gps-tracking-system/internal/repository"
)

// CategoryReports is the permission_categories.id under which every
// masterreport permission row is registered. It matches the "Reports"
// category seeded by the existing api/rbac_permissions.go bootstrap so the
// new rows appear under the same section in the Role Management UI
// (design §11.1, Req 8.8).
const CategoryReports = 5

// Permission code constants exposed for use by middleware and the frontend
// permission gates. The per-report codes (`reports.<id>.view`, etc.) are
// constructed at runtime from the Catalog and therefore have no constants.
const (
	// PermReportsViewBase is the menu-level base permission gating the
	// "Master Consolidated Reports" sidebar item and the Catalog endpoint
	// (Req 8.2, 9.3, 9.4). It is already declared by
	// api/rbac_permissions.go; we emit it here as well so the masterreport
	// package owns a single source of truth for module permissions. The
	// ON CONFLICT DO NOTHING clause in RegisterPermissions makes the
	// duplicate insert a no-op.
	PermReportsViewBase = "reports.view"

	// PermReportsForceRecalculate is the admin permission required, in
	// combination with reports.<id>.view, to invoke Force_Recalculate on
	// any report (Req 7.5, 8.2).
	PermReportsForceRecalculate = "reports.force_recalculate"
)

// Permission-type tags used for the per-report rows. Kept as constants so
// the Role Management UI and any future grouping logic can switch on them
// without re-deriving the tag from the code string.
const (
	permTypeReport   = "report"
	permTypeExport   = "export"
	permTypeGenerate = "generate"
	permTypeMenu     = "menu"
	permTypeAction   = "action"
)

// basePermissionDisplayOrder is the DisplayOrder assigned to the first base
// row (reports.view). The second base row (reports.force_recalculate) takes
// the next slot. Per-report rows start at perReportDisplayOrderStart so the
// base rows always render at the top of the Reports category in the Role
// Management UI regardless of how many reports are registered.
const (
	basePermissionDisplayOrder = 1
	// perReportDisplayOrderStart leaves room (1..99) for the legacy
	// rbac_permissions.go entries already occupying the low integers in
	// category 5 (reports.movement, reports.coverage, etc.).
	perReportDisplayOrderStart = 100
)

// PermissionsForCatalog returns the full set of permission rows that the
// Master Consolidated Reporting module needs seeded at boot. For each
// registered ReportDefinition the result contains three rows —
// `reports.<id>.view`, `reports.<id>.export`, and `reports.<id>.generate`
// (75 rows for the standard 25-report catalog) — followed by the two
// category-level base rows `reports.view` and `reports.force_recalculate`.
// All rows live under CategoryID = CategoryReports (5) so they group under
// a single "Reports" section in the Role Management UI (Req 8.1, 8.8).
//
// The Name field is a human-readable label derived from def.Name (e.g.
// "View Daily Vehicle Deployment"); the Code field is the canonical
// permission key the middleware and frontend check against. Rows are
// emitted in registration order so the surfaced display order in the UI
// matches the order in which definitions were registered with the Catalog.
//
// Passing a nil Catalog returns just the two base rows. This keeps the
// function safe to call before catalog population finishes during boot —
// production callers always supply a populated *Catalog so the full
// per-report set is emitted.
//
// The caller is expected to forward the returned slice to
// repository.RBACRepository.RegisterPermissions; that method's ON CONFLICT
// DO NOTHING clause makes the call idempotent across reboots (Req 8.1).
//
// Requirements: 8.1, 8.2, 8.8.
func PermissionsForCatalog(c *Catalog) []repository.Permission {
	var defs []*ReportDefinition
	if c != nil {
		defs = c.List()
	}

	// 3 per-report rows + 2 base rows. Pre-sized for the common case.
	out := make([]repository.Permission, 0, len(defs)*3+2)

	// Base rows first so they appear at the top of the Reports category in
	// the Role Management UI (Req 8.2).
	out = append(out,
		repository.Permission{
			CategoryID:     CategoryReports,
			Code:           PermReportsViewBase,
			Name:           "View Reports Menu",
			Description:    "Grants access to the Master Consolidated Reports menu and catalog.",
			PermissionType: permTypeMenu,
			IsMenu:         true,
			MenuPath:       "/master-reports",
			DisplayOrder:   basePermissionDisplayOrder,
		},
		repository.Permission{
			CategoryID:     CategoryReports,
			Code:           PermReportsForceRecalculate,
			Name:           "Force Recalculate Reports",
			Description:    "Allows bypassing the report output cache to force a fresh recompute.",
			PermissionType: permTypeAction,
			DisplayOrder:   basePermissionDisplayOrder + 1,
		},
	)

	// Per-report rows in catalog registration order. Each report occupies
	// three consecutive DisplayOrder slots (view, export, generate) so the
	// UI lists them as a coherent triple per report.
	for i, def := range defs {
		order := perReportDisplayOrderStart + i*3
		out = append(out,
			repository.Permission{
				CategoryID:     CategoryReports,
				Code:           fmt.Sprintf("reports.%s.view", def.ID),
				Name:           fmt.Sprintf("View %s", def.Name),
				Description:    fmt.Sprintf("View the %s report.", def.Name),
				PermissionType: permTypeReport,
				DisplayOrder:   order,
			},
			repository.Permission{
				CategoryID:     CategoryReports,
				Code:           fmt.Sprintf("reports.%s.export", def.ID),
				Name:           fmt.Sprintf("Export %s", def.Name),
				Description:    fmt.Sprintf("Export the %s report to Excel or PDF.", def.Name),
				PermissionType: permTypeExport,
				DisplayOrder:   order + 1,
			},
			repository.Permission{
				CategoryID:     CategoryReports,
				Code:           fmt.Sprintf("reports.%s.generate", def.ID),
				Name:           fmt.Sprintf("Generate %s", def.Name),
				Description:    fmt.Sprintf("Trigger generation of the %s report.", def.Name),
				PermissionType: permTypeGenerate,
				DisplayOrder:   order + 2,
			},
		)
	}

	return out
}
