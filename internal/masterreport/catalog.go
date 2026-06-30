// Package masterreport contains the Master Consolidated Reporting Module.
//
// This file implements Catalog.Validate, the boot-time semantic check that
// runs once after every reports_*.go file has called MustRegister. Where
// MustRegister enforces value-level invariants on a single ReportDefinition
// (Req 1.5: report_id shape, DataSource non-nil, no duplicate ID), Validate
// enforces cross-state invariants that depend on the declared permission
// convention:
//
//   - Every DataSource is non-nil. MustRegister already rejects nil
//     adapters, but Validate repeats the check so a Catalog mutated through
//     reflection or tests still fails closed at boot.
//   - Every PermissionKey matches exactly "reports.<id>.view", where <id>
//     is the report's own ID. The broader RBAC coherence check (every
//     reports.<id>.{view,export,generate} row exists in the permissions
//     table, and the reverse direction) is Property 14 and is implemented
//     in task 14.3 alongside the property test; this method intentionally
//     does not query the database for those rows.
//
// The exporter no longer reads any template file at runtime — every
// workbook is rendered programmatically from PreviewLayout — so Validate
// does not check the filesystem and does not take a template directory
// argument.
//
// Validate accumulates every offending Report_Definition into a single
// joined error rather than short-circuiting on the first failure. Offenders
// are sorted by ReportID so two boots over the same catalog state surface
// the same error string — operators can grep release-to-release diffs of
// the startup log and trust that the order carries information.
//
// Requirements covered: 1.5, 1.8.
package masterreport

import (
	"context"
	"errors"
	"fmt"
	"sort"

	"gps-tracking-system/internal/repository"
)

// Validate runs the boot-time semantic checks on the catalog. It is invoked
// once from cmd/server/main.go after every reports_*.go file has registered
// its definitions and immediately before the HTTP server begins serving
// traffic. Any non-nil return value MUST abort startup (Req 1.8).
//
// Parameters:
//
//   - ctx is honored between each per-report check so a slow validator
//     extension cannot hang startup indefinitely.
//   - rbac is the RBAC repository handle. The wider permissions-table
//     coherence check (Property 14) is deferred to task 14.3; this method
//     only requires the handle to be non-nil so the caller cannot
//     accidentally bypass the broader check by passing nil. The returned
//     error explicitly names rbac when it is nil so the misconfiguration
//     is obvious in the startup log.
//
// The returned error, when non-nil, is the join of one error per offending
// report (errors.Join, Go 1.20+). Each sub-error names the offending
// report_id and the specific violation. Callers can use errors.Is /
// errors.As against the sub-errors if they wish, but the canonical
// consumer is cmd/server/main.go logging the joined Error() string and
// exiting non-zero.
func (c *Catalog) Validate(ctx context.Context, rbac *repository.RBACRepository) error {
	if ctx == nil {
		return errors.New("master report: Catalog.Validate requires a non-nil context")
	}
	if rbac == nil {
		return errors.New("master report: Catalog.Validate requires a non-nil *repository.RBACRepository")
	}

	// Snapshot under the read lock so concurrent registrations (which in
	// practice never happen post-boot but cost nothing to guard against)
	// cannot trip the iteration. We copy pointers — the underlying
	// ReportDefinition values are immutable post-registration.
	c.mu.RLock()
	defs := make([]*ReportDefinition, 0, len(c.order))
	for _, id := range c.order {
		defs = append(defs, c.defs[id])
	}
	c.mu.RUnlock()

	// Sort by ReportID so the joined error string is deterministic across
	// boots regardless of registration order. Property 14's test in task
	// 14.3 relies on this stability when comparing observed messages
	// against expected counterexamples.
	sort.Slice(defs, func(i, j int) bool {
		return defs[i].ID < defs[j].ID
	})

	var offenders []error
	for _, def := range defs {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := validateOne(def); err != nil {
			offenders = append(offenders, err)
		}
	}

	if len(offenders) == 0 {
		return nil
	}
	return errors.Join(offenders...)
}

// validateOne runs every per-report check against def and returns the join
// of every violation observed (or nil when def is clean). Splitting this
// out keeps Validate's outer loop readable and gives task 14.3's property
// test a small surface to exercise.
func validateOne(def *ReportDefinition) error {
	if def == nil {
		// A nil pointer in the catalog is a programming error in
		// MustRegister, but Validate still surfaces it rather than
		// dereferencing.
		return errors.New("master report: catalog contains nil *ReportDefinition")
	}

	var errs []error

	// DataSource non-nil. MustRegister already enforces this; the
	// duplicate check here defends against a Catalog mutated through a
	// test helper that bypassed MustRegister.
	if def.DataSource == nil {
		errs = append(errs, fmt.Errorf("master report: %q has nil DataSource", def.ID))
	}

	// PermissionKey shape. The task description fixes this to exactly
	// "reports.<id>.view". The .export and .generate variants are
	// permission codes that ride alongside .view in the permissions
	// table (see Property 14) but they are not stored on the
	// ReportDefinition — only the .view key is, because it gates catalog
	// visibility (Req 1.6).
	expectedKey := fmt.Sprintf("reports.%s.view", def.ID)
	if def.PermissionKey != expectedKey {
		errs = append(errs, fmt.Errorf("master report: %q has permission_key %q, expected %q", def.ID, def.PermissionKey, expectedKey))
	}

	if len(errs) == 0 {
		return nil
	}
	return errors.Join(errs...)
}
