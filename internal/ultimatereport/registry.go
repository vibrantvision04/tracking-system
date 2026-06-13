package ultimatereport

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────────
// ReportRegistry — pluggable engine for future reports
// Adding a new report requires:
//   1. Upload a new Excel template to storage/report-templates/
//   2. Create a ReportBuilder function (queries + data assembly)
//   3. Call Register() once (e.g. in main.go or init())
// ─────────────────────────────────────────────────────────────────────────────

// ReportBuilder assembles data for a specific report type.
// It returns ReportData which the ExcelEngine injects into the template.
type ReportBuilder func(ctx context.Context, date time.Time) (*ReportData, error)

// ReportDefinition describes a single registered report.
type ReportDefinition struct {
	// ID is a URL-safe identifier, e.g. "ultimate-daily", "attendance-summary"
	ID string
	// Name is the human-readable label shown in the UI
	Name string
	// TemplateName is the filename inside storage/report-templates/
	// e.g. "ultimate-report.xlsx", "attendance-summary.xlsx"
	TemplateName string
	// Builder assembles the ReportData for this report type
	Builder ReportBuilder
	// Description is shown in the "Ultimate Reports" frontend menu
	Description string
}

// registry is the global store of report definitions.
var (
	registryMu sync.RWMutex
	registry   = make(map[string]*ReportDefinition)
	// registryOrder preserves insertion order for the UI list
	registryOrder []string
)

// Register adds a report definition to the global registry.
// Panics if the ID is already registered (programming error).
func Register(def *ReportDefinition) {
	registryMu.Lock()
	defer registryMu.Unlock()
	if _, exists := registry[def.ID]; exists {
		panic(fmt.Sprintf("ultimatereport: duplicate report ID %q", def.ID))
	}
	registry[def.ID] = def
	registryOrder = append(registryOrder, def.ID)
}

// Get retrieves a registered report definition by ID.
func Get(id string) (*ReportDefinition, bool) {
	registryMu.RLock()
	defer registryMu.RUnlock()
	def, ok := registry[id]
	return def, ok
}

// List returns all registered report definitions in registration order.
func List() []*ReportDefinition {
	registryMu.RLock()
	defer registryMu.RUnlock()
	result := make([]*ReportDefinition, 0, len(registryOrder))
	for _, id := range registryOrder {
		result = append(result, registry[id])
	}
	return result
}
