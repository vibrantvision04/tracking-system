// Package masterreport contains the Master Consolidated Reporting Module.
//
// This file implements the in-memory Catalog that holds every registered
// Report_Definition. The Catalog is populated at boot time from constants
// declared in the per-report files (reports_*.go); MustRegister panics on
// any structural violation so the process fails fast before serving any
// request (Req 1.8).
//
// Boot-time semantic validation that depends on external state (template
// files on disk, RBAC permission rows) lives in Catalog.Validate (see
// catalog.go / task 3.3). MustRegister handles only the checks that can be
// performed against the ReportDefinition value alone:
//
//   - report_id is non-empty, ≤ MaxReportIDLength characters, and matches
//     the closed regex ^[a-z0-9_]+$ (delegated to ReportID.Validate, Req 1.5).
//   - DataSource is non-nil (the real Compute / InputVersion contract lives
//     in datasource.go; this check rejects definitions registered without
//     an adapter).
//   - The report_id has not already been registered.
//
// Read-side access is guarded by a sync.RWMutex. Catalog.List and
// FilterByPrincipal return freshly-allocated slices so callers may sort or
// rearrange the result without disturbing internal state.
//
// Requirements covered: 1.1, 1.5, 1.6, 1.7.
package masterreport

import (
	"fmt"
	"sync"
)

// Catalog is the in-memory registry of every Report_Definition known to the
// Master_Reporting_Module. It is populated once at boot via MustRegister and
// then accessed read-mostly through Get, List, and FilterByPrincipal.
//
// The zero value is not usable; construct instances through NewCatalog.
type Catalog struct {
	// mu guards defs and order. Registration takes a write lock; every
	// reader takes a read lock so concurrent Get/List/FilterByPrincipal
	// calls do not serialize against one another.
	mu sync.RWMutex

	// defs maps ReportID → registered ReportDefinition pointer. The
	// pointer identity is stable for the lifetime of the Catalog; nothing
	// mutates a registered *ReportDefinition after MustRegister returns.
	defs map[ReportID]*ReportDefinition

	// order records insertion order so List and FilterByPrincipal return
	// reports in the same sequence in which they were registered. This
	// matters because the frontend renders the report selector in catalog
	// order and operations staff rely on the legacy worksheet layout.
	order []ReportID
}

// NewCatalog constructs an empty Catalog ready to receive MustRegister calls.
func NewCatalog() *Catalog {
	return &Catalog{
		defs:  make(map[ReportID]*ReportDefinition),
		order: make([]ReportID, 0, 32),
	}
}

// MustRegister inserts def into the Catalog. It is intended to be called
// exclusively from package-level boot code (cmd/server/main.go and the
// reports_*.go files); failures indicate a programming error in the catalog
// itself, so MustRegister panics rather than returning an error.
//
// Panic conditions (Req 1.5, 1.8):
//
//   - def is nil.
//   - def.ID fails ReportID.Validate (empty, too long, or violates the
//     ^[a-z0-9_]+$ regex).
//   - def.DataSource is nil. The interface value is nil when no adapter
//     pointer has been assigned; callers passing a typed-nil pointer to a
//     concrete adapter type will still trip this check because Go reports
//     such interface values as non-nil only when the underlying concrete
//     pointer is non-nil. Catalog.Validate (task 3.3) performs the
//     stronger semantic checks (template files on disk, permission rows
//     present).
//   - def.ID has already been registered (duplicate report_id).
func (c *Catalog) MustRegister(def *ReportDefinition) {
	if def == nil {
		panic("master report: MustRegister called with nil ReportDefinition")
	}
	if err := def.ID.Validate(); err != nil {
		panic(fmt.Sprintf("master report: MustRegister rejected definition: %v", err))
	}
	if def.DataSource == nil {
		panic(fmt.Sprintf("master report: MustRegister %q has nil DataSource", def.ID))
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	if _, exists := c.defs[def.ID]; exists {
		panic(fmt.Sprintf("master report: duplicate report_id %q registered in catalog", def.ID))
	}
	c.defs[def.ID] = def
	c.order = append(c.order, def.ID)
}

// Get returns the ReportDefinition registered under id, or (nil, false) when
// no such report exists. The returned pointer is the same value MustRegister
// stored; callers must not mutate it.
func (c *Catalog) Get(id ReportID) (*ReportDefinition, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	def, ok := c.defs[id]
	return def, ok
}

// List returns every registered ReportDefinition in registration order.
// The returned slice is a fresh allocation; the caller is free to sort or
// otherwise rearrange it. The *ReportDefinition values inside the slice are
// still shared with the Catalog and must not be mutated.
func (c *Catalog) List() []*ReportDefinition {
	c.mu.RLock()
	defer c.mu.RUnlock()

	out := make([]*ReportDefinition, 0, len(c.order))
	for _, id := range c.order {
		out = append(out, c.defs[id])
	}
	return out
}

// FilterByPrincipal returns the subset of registered reports whose
// PermissionKey is present in perms, preserving registration order. The
// result is the catalog view that should be rendered to a principal holding
// the supplied permission set (Req 1.6, 1.7).
//
// A nil or empty perms slice returns an empty result — Req 1.7 specifies
// that unauthenticated principals or principals with no matching permission
// see an empty Report_Catalog rather than any subset of metadata.
func (c *Catalog) FilterByPrincipal(perms []string) []*ReportDefinition {
	if len(perms) == 0 {
		return []*ReportDefinition{}
	}

	// Build a set for O(1) membership checks. The expected size is the
	// principal's role permissions (≤ low hundreds in practice), so the
	// allocation cost is negligible compared to the linear scan it avoids.
	granted := make(map[string]struct{}, len(perms))
	for _, p := range perms {
		granted[p] = struct{}{}
	}

	c.mu.RLock()
	defer c.mu.RUnlock()

	out := make([]*ReportDefinition, 0, len(c.order))
	for _, id := range c.order {
		def := c.defs[id]
		if _, ok := granted[def.PermissionKey]; ok {
			out = append(out, def)
		}
	}
	return out
}
