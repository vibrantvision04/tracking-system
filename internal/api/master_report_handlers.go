// Package api — Master_Reporting_Module HTTP handlers (task 15.1).
//
// This file defines the six endpoints that sit between the chi router and
// the masterreport orchestration layer:
//
//	GET  /api/master-reports/catalog                       → GetCatalog
//	POST /api/master-reports/{report_id}/generate          → GenerateReport
//	POST /api/master-reports/{report_id}/recalculate       → ForceRecalculate
//	GET  /api/master-reports/{report_id}/export.xlsx       → ExportExcel
//	GET  /api/master-reports/{report_id}/export.pdf        → ExportPDF
//	GET  /api/master-reports/jobs/{job_id}                 → GetJob
//
// Permission checks are owned by the router middleware (task 15.2 /
// 15.3) — none of the handlers below re-check `reports.<id>.view` or
// `reports.force_recalculate`. The handlers DO consult the catalog's
// FilterByPrincipal for GetCatalog (Req 1.6, 1.7) because that is a
// filtering operation, not a gate.
//
// Audit emission: every handler ends with masterreport.Auditor.EmitWithBudget
// (task 12.2) carrying report_id, filter_hash, filters, operational_date,
// outcome, http_status, and request_ts_ms. The HTTP status code surfaced
// to audit is captured via the statusRecorder wrapper around the
// http.ResponseWriter so the value reflects whatever the handler actually
// committed.
//
// Requirements covered: 1.6, 1.7, 6.1, 7.1, 7.3, 11.4, 13.3.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"gps-tracking-system/internal/audit"
	"gps-tracking-system/internal/masterreport"
	"gps-tracking-system/internal/shift"
)

// -----------------------------------------------------------------------------
// statusRecorder — captures the response status code for audit metadata
// -----------------------------------------------------------------------------

// statusRecorder wraps an http.ResponseWriter and captures the status code
// the handler ultimately commits. WriteHeader records the value before
// delegating; Write defaults to 200 when WriteHeader has not been called
// (matching net/http's implicit behaviour) so the recorded status always
// reflects what the client actually observed.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	if s.status == 0 {
		s.status = code
	}
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Write(b []byte) (int, error) {
	if s.status == 0 {
		s.status = http.StatusOK
	}
	return s.ResponseWriter.Write(b)
}

// statusOr returns the recorded status code, or fallback when WriteHeader
// has never been observed and no Write has occurred.
func (s *statusRecorder) statusOr(fallback int) int {
	if s.status == 0 {
		return fallback
	}
	return s.status
}

// -----------------------------------------------------------------------------
// Module-availability guard
// -----------------------------------------------------------------------------

// mrAvailable reports whether SetMasterReportingModule has been called with
// every required dependency. When false the handlers below short-circuit
// to 503 so the operator sees a clear "module not wired" signal instead
// of a nil-deref.
func (h *Handler) mrAvailable() bool {
	return h.mrCatalog != nil &&
		h.mrSmartLoad != nil &&
		h.mrForceRecal != nil &&
		h.mrJobs != nil &&
		h.mrExcel != nil &&
		h.mrPDF != nil &&
		h.mrAuditor != nil
}

// writeMRUnavailable emits a uniform 503 envelope for handlers invoked
// before the module has been wired.
func writeMRUnavailable(w http.ResponseWriter) {
	writeJSONError(w, http.StatusServiceUnavailable, map[string]any{
		"code":    "master_reporting_unavailable",
		"message": "master reporting module is not yet initialised",
	})
}

// -----------------------------------------------------------------------------
// Response helpers
// -----------------------------------------------------------------------------

// writeJSON serialises payload to w with the supplied status code. The
// response envelope shape is whatever the caller passes; this differs
// from the package's generic sendJSON helper because the master-report
// endpoints follow design §15's bespoke envelope (top-level `reports`,
// `payload`, `path`, `error.code`, etc.) rather than the legacy
// {success, data, error} wrapper.
func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

// writeJSONError emits {"error": {...}} with the supplied error object.
func writeJSONError(w http.ResponseWriter, status int, errObj map[string]any) {
	writeJSON(w, status, map[string]any{"error": errObj})
}

// classifyError maps a masterreport error into (status, code, stage). The
// stage component is non-empty for the export-specific timeout / size
// errors so the HTTP body can surface design §15.4 / §15.5's
// `error.stage` field.
func classifyError(err error) (status int, code string, stage string) {
	switch {
	case errors.Is(err, masterreport.ErrUnknownReportID):
		return http.StatusNotFound, "report_not_found", ""
	case errors.Is(err, masterreport.ErrJobNotFound):
		return http.StatusNotFound, "job_not_found", ""
	case errors.Is(err, masterreport.ErrRecomputeTimeout):
		return http.StatusGatewayTimeout, "recompute_timeout", ""
	case errors.Is(err, masterreport.ErrPDFRecomputeTimeout):
		return http.StatusGatewayTimeout, "recompute_timeout", "pdf"
	case errors.Is(err, masterreport.ErrExportTooWide):
		return http.StatusBadRequest, "export_too_wide_for_pdf", "pdf"
	case errors.Is(err, masterreport.ErrPoolFull):
		return http.StatusTooManyRequests, "pool_overload", ""
	case errors.Is(err, masterreport.ErrRecomputeFailed):
		return http.StatusBadGateway, "recompute_failed", ""
	}
	// ValidationError needs errors.As since it is a pointer to a struct.
	var verr *masterreport.ValidationError
	if errors.As(err, &verr) {
		return http.StatusBadRequest, "filter_validation_failed", ""
	}
	return http.StatusInternalServerError, "internal_error", ""
}

// writeMRError renders the canonical error envelope for a masterreport
// error and returns the committed status code so the caller can pass it
// to audit emission.
func writeMRError(w http.ResponseWriter, err error) int {
	status, code, stage := classifyError(err)
	obj := map[string]any{
		"code":    code,
		"message": err.Error(),
	}
	if stage != "" {
		obj["stage"] = stage
	}
	writeJSONError(w, status, obj)
	return status
}

// -----------------------------------------------------------------------------
// Filter payload decoding
// -----------------------------------------------------------------------------

// generateRequest is the JSON body shape accepted by GenerateReport and
// ForceRecalculate. Both endpoints take the same envelope per design
// §15.2 / §15.3.
type generateRequest struct {
	Filters map[string]any `json:"filters"`
}

// decodeFilterPayload converts a raw JSON-decoded filter map (from POST
// body) or a URL-query map (string→string) into a typed FilterPayload
// driven by the report's declared filter schema. Keys not declared on
// the ReportDefinition are passed through unchanged so FilterValidator
// can flag them as unsupported with a stable error message — silently
// dropping unknown keys would mask client bugs.
//
// The function handles the JSON-types and the URL-query-string flavour
// uniformly: a numeric id may arrive as a JSON number (decoded to
// float64 by encoding/json) or as a decimal string (from a query param),
// and either form is converted to int. Dates accept "YYYY-MM-DD" and
// RFC3339; date_range accepts a [2]string array or a "start,end" string
// (the form-friendly shape).
func decodeFilterPayload(def *masterreport.ReportDefinition, raw map[string]any) (masterreport.FilterPayload, error) {
	out := make(masterreport.FilterPayload, len(raw))
	for ks, rv := range raw {
		k := masterreport.FilterKey(ks)
		converted, err := convertFilterValue(k, rv)
		if err != nil {
			return nil, fmt.Errorf("filter %q: %w", ks, err)
		}
		out[k] = converted
	}
	_ = def // declared for future per-schema coercion hints (currently unused)
	return out, nil
}

// convertFilterValue turns one raw value into its FilterPayload-typed
// counterpart based on the FilterKey. Anything we cannot recognise is
// returned as-is so FilterValidator surfaces a clean error message
// against the wire-level value.
func convertFilterValue(k masterreport.FilterKey, rv any) (any, error) {
	switch k {
	case masterreport.FilterDate:
		return parseDateValue(rv)
	case masterreport.FilterDateRange:
		return parseDateRangeValue(rv)
	case masterreport.FilterVehicle, masterreport.FilterEmployee:
		return parseIntOrIntListValue(rv)
	default:
		// Zone, ward, shift, route, route_type, department, designation
		// are all string-typed in the canonical schema. Numeric
		// inputs are coerced via fmt to preserve client-side
		// conveniences.
		switch v := rv.(type) {
		case nil:
			return "", nil
		case string:
			return v, nil
		case float64:
			return strconv.FormatFloat(v, 'g', -1, 64), nil
		case bool:
			return strconv.FormatBool(v), nil
		default:
			return fmt.Sprintf("%v", v), nil
		}
	}
}

// parseDateValue accepts a time.Time, "YYYY-MM-DD", or RFC3339 string
// and returns the time.Time at UTC midnight. Empty input becomes the
// zero time, which FilterValidator treats as "missing".
func parseDateValue(rv any) (time.Time, error) {
	switch v := rv.(type) {
	case nil:
		return time.Time{}, nil
	case time.Time:
		return v.UTC(), nil
	case string:
		if v == "" {
			return time.Time{}, nil
		}
		if t, err := time.Parse("2006-01-02", v); err == nil {
			return t.UTC(), nil
		}
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			return t.UTC(), nil
		}
		if t, err := time.Parse(time.RFC3339Nano, v); err == nil {
			return t.UTC(), nil
		}
		return time.Time{}, fmt.Errorf("expected YYYY-MM-DD or RFC3339, got %q", v)
	default:
		return time.Time{}, fmt.Errorf("expected date string, got %T", rv)
	}
}

// parseDateRangeValue accepts a [2]string array, a []any of length 2 (the
// JSON form), or a "start,end" string (the URL-query-friendly form) and
// returns a [2]time.Time.
func parseDateRangeValue(rv any) ([2]time.Time, error) {
	var out [2]time.Time
	switch v := rv.(type) {
	case nil:
		return out, nil
	case [2]time.Time:
		return v, nil
	case []any:
		if len(v) != 2 {
			return out, fmt.Errorf("expected 2-element array, got %d elements", len(v))
		}
		a, err := parseDateValue(v[0])
		if err != nil {
			return out, fmt.Errorf("element 0: %w", err)
		}
		b, err := parseDateValue(v[1])
		if err != nil {
			return out, fmt.Errorf("element 1: %w", err)
		}
		return [2]time.Time{a, b}, nil
	case []string:
		if len(v) != 2 {
			return out, fmt.Errorf("expected 2-element array, got %d elements", len(v))
		}
		a, err := parseDateValue(v[0])
		if err != nil {
			return out, fmt.Errorf("element 0: %w", err)
		}
		b, err := parseDateValue(v[1])
		if err != nil {
			return out, fmt.Errorf("element 1: %w", err)
		}
		return [2]time.Time{a, b}, nil
	case string:
		parts := strings.Split(v, ",")
		if len(parts) != 2 {
			return out, fmt.Errorf("expected start,end form, got %q", v)
		}
		a, err := parseDateValue(strings.TrimSpace(parts[0]))
		if err != nil {
			return out, fmt.Errorf("start: %w", err)
		}
		b, err := parseDateValue(strings.TrimSpace(parts[1]))
		if err != nil {
			return out, fmt.Errorf("end: %w", err)
		}
		return [2]time.Time{a, b}, nil
	default:
		return out, fmt.Errorf("expected date_range, got %T", rv)
	}
}

// parseIntOrIntListValue accepts an int, a JSON number (float64), an
// int-bearing string, a []any of numbers or numeric strings, or a
// comma-separated string of ints. Returns either int or []int.
func parseIntOrIntListValue(rv any) (any, error) {
	switch v := rv.(type) {
	case nil:
		return 0, nil
	case int:
		return v, nil
	case float64:
		return int(v), nil
	case []int:
		return v, nil
	case []any:
		out := make([]int, 0, len(v))
		for i, el := range v {
			n, err := parseIntElement(el)
			if err != nil {
				return nil, fmt.Errorf("element %d: %w", i, err)
			}
			out = append(out, n)
		}
		return out, nil
	case string:
		if strings.Contains(v, ",") {
			parts := strings.Split(v, ",")
			out := make([]int, 0, len(parts))
			for i, p := range parts {
				n, err := strconv.Atoi(strings.TrimSpace(p))
				if err != nil {
					return nil, fmt.Errorf("element %d: %w", i, err)
				}
				out = append(out, n)
			}
			return out, nil
		}
		if v == "" {
			return 0, nil
		}
		return strconv.Atoi(v)
	default:
		return nil, fmt.Errorf("expected int or []int, got %T", rv)
	}
}

func parseIntElement(rv any) (int, error) {
	switch v := rv.(type) {
	case int:
		return v, nil
	case float64:
		return int(v), nil
	case string:
		return strconv.Atoi(strings.TrimSpace(v))
	default:
		return 0, fmt.Errorf("unsupported element type %T", rv)
	}
}

// queryToRawFilters reads filter keys from URL query params, dropping any
// param whose key is not a recognised FilterKey. Used by the GET export
// endpoints where filters arrive as `?date=...&zone=...`.
func queryToRawFilters(r *http.Request) map[string]any {
	out := make(map[string]any)
	q := r.URL.Query()
	for _, fk := range masterreport.AllFilterKeys() {
		ks := string(fk)
		vals, ok := q[ks]
		if !ok || len(vals) == 0 {
			continue
		}
		if fk == masterreport.FilterDateRange {
			// date_range is either two values (start, end) or a
			// single comma-separated string.
			if len(vals) >= 2 {
				out[ks] = []string{vals[0], vals[1]}
			} else {
				out[ks] = vals[0]
			}
			continue
		}
		// Take the first value for single-valued params; multi-valued
		// numeric lists arrive as a comma-separated string per
		// parseIntOrIntListValue.
		out[ks] = vals[0]
	}
	return out
}

// -----------------------------------------------------------------------------
// Operational date resolution
// -----------------------------------------------------------------------------

// operationalDateFor derives the operational date for a request from the
// supplied filters. Reports declaring a `date` filter use that value;
// reports declaring a `date_range` use the start of the range; reports
// with neither fall back to today's operational date computed under the
// report's per-report cutoff (defaults to 4h per design §3.1).
//
// The returned time.Time is always at UTC midnight so it round-trips
// cleanly through the CacheKey / JobKey normalisers.
func operationalDateFor(def *masterreport.ReportDefinition, p masterreport.FilterPayload, now time.Time) time.Time {
	if t, ok := p[masterreport.FilterDate].(time.Time); ok && !t.IsZero() {
		return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
	}
	if r, ok := p[masterreport.FilterDateRange].([2]time.Time); ok && !r[0].IsZero() {
		t := r[0]
		return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
	}
	today := shift.OperationalDate(now, def.EffectiveOperationalCutoff())
	return time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.UTC)
}

// -----------------------------------------------------------------------------
// Principal extraction
// -----------------------------------------------------------------------------

// principalInfo captures the request-side identity bits the audit emitter
// and catalog filter both need. Zero-valued userID with empty email
// signals an unauthenticated request — the masterreport.Auditor will
// emit anonymous fallback metadata in that case (Req 10.3).
type principalInfo struct {
	userID int
	email  string
	ip     string
}

// resolvePrincipal builds a principalInfo from the request. Missing
// claims are tolerated so the handler still emits an audit row (with
// anonymous fallback) rather than panicking.
func resolvePrincipal(r *http.Request) principalInfo {
	p := principalInfo{ip: clientIP(r)}
	if c := GetClaims(r); c != nil {
		p.userID = c.UserID
		p.email = c.Email
	}
	return p
}

// principalPermissions returns the permission set held by the request's
// principal. Super admins receive the literal "*" so callers can treat
// them as wildcard. Empty or unauthenticated principals yield an empty
// slice, which is exactly the input Catalog.FilterByPrincipal needs to
// produce the empty-catalog response from Req 1.7.
func (h *Handler) principalPermissions(r *http.Request, userID int) []string {
	if userID == 0 || h.rbacRepo == nil {
		return nil
	}
	if isSuper, _ := h.rbacRepo.IsSuperAdmin(r.Context(), userID); isSuper {
		return []string{"*"}
	}
	perms, _ := h.rbacRepo.GetUserPermissions(r.Context(), userID)
	return perms
}

// expandSuperAdmin returns the canonical "all-reports" permission slice
// for a super admin — every registered report's view permission key.
// FilterByPrincipal does an exact-string membership check, so super
// admins need every concrete key materialised; the "*" sentinel from
// principalPermissions is just a marker.
func (h *Handler) expandSuperAdmin() []string {
	defs := h.mrCatalog.List()
	keys := make([]string, 0, len(defs))
	for _, def := range defs {
		keys = append(keys, def.PermissionKey)
	}
	return keys
}

// -----------------------------------------------------------------------------
// Per-report permission middleware factory (task 15.2)
// -----------------------------------------------------------------------------
//
// requireReportPermission builds a chi-compatible middleware that gates the
// request on `reports.<report_id>.<suffix>`, where `report_id` is read
// from the URL path. The factory is invoked once per route at wiring
// time (task 15.3) — e.g.
//
//	r.With(h.requireReportPermission("view")).Get(
//	    "/api/master-reports/{report_id}/export.xlsx", h.ExportExcel)
//	r.With(h.requireReportPermission("export")).Get(
//	    "/api/master-reports/{report_id}/export.pdf",  h.ExportPDF)
//	r.With(h.requireReportPermission("generate")).Post(
//	    "/api/master-reports/{report_id}/generate",    h.GenerateReport)
//
// so each per-report endpoint keys on its own permission row and a
// principal granted `reports.foo.view` cannot exercise `reports.bar.view`.
//
// Validation is performed BEFORE the permission check so that an invalid
// `{report_id}` value never reaches the RBAC layer — clients see a 400
// `invalid_report_id` envelope rather than a 403 that could be misread
// as "you lack access to a real report". The accepted shape mirrors
// Req 1.5: lowercase ASCII alphanumeric plus underscore, length 1..64.
//
// IMPORTANT — `reports.force_recalculate` is a SEPARATE, non-per-report
// permission. `requireReportPermission("force_recalculate")` would
// generate `reports.<id>.force_recalculate`, which is not the same key.
// The router (task 15.3) checks that admin-only permission via a direct
// `h.RequirePermission("reports.force_recalculate")` call alongside
// `h.requireReportPermission("view")`; see design §15.3.
//
// Requirements: 8.3, 8.4, 8.5.
func (h *Handler) requireReportPermission(suffix string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			reportID := chi.URLParam(r, "report_id")
			if !isValidReportID(reportID) {
				writeJSONError(w, http.StatusBadRequest, map[string]any{
					"code":    "invalid_report_id",
					"message": fmt.Sprintf("report_id must match ^[a-z0-9_]+$ and be <=%d chars", masterreport.MaxReportIDLength),
				})
				return
			}
			permCode := fmt.Sprintf("reports.%s.%s", reportID, suffix)
			h.RequirePermission(permCode)(next).ServeHTTP(w, r)
		})
	}
}

// isValidReportID enforces the closed `report_id` shape from Req 1.5:
// lowercase ASCII letters, digits, and underscore; length
// 1..masterreport.MaxReportIDLength. The hand-rolled scan is faster
// than a regexp.MustCompile on the hot path and keeps the check
// allocation-free; the upper bound is sourced from the canonical
// constant in the masterreport package so a single edit there
// propagates to both the model and the HTTP gate.
func isValidReportID(id string) bool {
	if len(id) == 0 || len(id) > masterreport.MaxReportIDLength {
		return false
	}
	for _, c := range id {
		switch {
		case c >= 'a' && c <= 'z':
		case c >= '0' && c <= '9':
		case c == '_':
		default:
			return false
		}
	}
	return true
}

// -----------------------------------------------------------------------------
// Handlers
// -----------------------------------------------------------------------------

// GetCatalog returns the catalog filtered by the principal's
// `reports.<id>.view` permission set (Req 1.6). When the resulting set
// is empty, the response is HTTP 200 with the canonical
// {"reports": [], "error":{"code":"no_accessible_reports"}} envelope
// per Req 1.7.
//
// This handler does not gate on a specific permission code — every
// authenticated principal may call it. The filtering is the
// authorisation: an unauthorised principal sees an empty catalog with
// the explicit error code.
func (h *Handler) GetCatalog(w http.ResponseWriter, r *http.Request) {
	rec := &statusRecorder{ResponseWriter: w}
	if !h.mrAvailable() {
		writeMRUnavailable(rec)
		return
	}
	p := resolvePrincipal(r)

	perms := h.principalPermissions(r, p.userID)
	// Super admins get every concrete view key materialised so the
	// catalog filter returns the full list.
	if len(perms) == 1 && perms[0] == "*" {
		perms = h.expandSuperAdmin()
	}

	defs := h.mrCatalog.FilterByPrincipal(perms)
	if len(defs) == 0 {
		writeJSON(rec, http.StatusOK, map[string]any{
			"reports": []any{},
			"error":   map[string]any{"code": "no_accessible_reports"},
		})
		return
	}

	// Sort by DisplayOrder ascending so the dropdown surfaces reports in
	// schedule order. Definitions with the same DisplayOrder fall back
	// to a stable secondary sort on ReportID so the response stays
	// deterministic across boots.
	sortedDefs := make([]*masterreport.ReportDefinition, len(defs))
	copy(sortedDefs, defs)
	sort.SliceStable(sortedDefs, func(i, j int) bool {
		if sortedDefs[i].DisplayOrder != sortedDefs[j].DisplayOrder {
			return sortedDefs[i].DisplayOrder < sortedDefs[j].DisplayOrder
		}
		return sortedDefs[i].ID < sortedDefs[j].ID
	})

	out := make([]map[string]any, 0, len(sortedDefs))
	for _, def := range sortedDefs {
		filters := make([]map[string]any, 0, len(def.Filters))
		for _, fc := range def.Filters {
			entry := map[string]any{
				"key":      string(fc.Key),
				"required": fc.Required,
			}
			if len(fc.DefaultJSON) > 0 {
				entry["default"] = json.RawMessage(fc.DefaultJSON)
			}
			filters = append(filters, entry)
		}
		out = append(out, map[string]any{
			"report_id":      string(def.ID),
			"name":           def.Name,
			"category":       string(def.Category),
			"filters":        filters,
			"permission_key": def.PermissionKey,
			"scheduled_time": def.ScheduledTimeHHMM(),
			"display_order":  def.DisplayOrder,
			"description":    def.Description,
		})
	}
	writeJSON(rec, http.StatusOK, map[string]any{"reports": out})
}

// GenerateReport runs FilterValidator.Validate → FilterHash →
// SmartLoader.Load. A successful sync execution returns 200 with the
// payload, the path, and the operational date. When the synchronous
// wait crosses 30s, the request is converted to async: the handler
// submits the same key to JobRegistry.SubmitOrGet and returns HTTP 202
// with the job_id (Req 11.4). The in-flight SmartLoader.Load goroutine
// is left running; SmartLoader's singleflight coalesces the JobRegistry
// run-func's second Load call onto the same Compute so the work is not
// duplicated (Req 6.6, Req 7.8).
func (h *Handler) GenerateReport(w http.ResponseWriter, r *http.Request) {
	rec := &statusRecorder{ResponseWriter: w}
	if !h.mrAvailable() {
		writeMRUnavailable(rec)
		return
	}
	principal := resolvePrincipal(r)

	reportIDStr := chi.URLParam(r, "report_id")
	reportID := masterreport.ReportID(reportIDStr)

	def, ok := h.mrCatalog.Get(reportID)
	if !ok {
		writeJSONError(rec, http.StatusNotFound, map[string]any{
			"code":    "report_not_found",
			"message": fmt.Sprintf("unknown report_id %q", reportIDStr),
		})
		h.emitMRAudit(r.Context(), audit.EventReportGenerate, principal, reportIDStr, "", nil, time.Time{}, "report_not_found", rec.statusOr(http.StatusNotFound))
		return
	}

	req, derr := decodeGenerateBody(r)
	if derr != nil {
		writeJSONError(rec, http.StatusBadRequest, map[string]any{
			"code":    "invalid_request_body",
			"message": derr.Error(),
		})
		h.emitMRAudit(r.Context(), audit.EventReportGenerate, principal, reportIDStr, "", nil, time.Time{}, "invalid_request_body", rec.statusOr(http.StatusBadRequest))
		return
	}

	filters, err := decodeFilterPayload(def, req.Filters)
	if err != nil {
		writeJSONError(rec, http.StatusBadRequest, map[string]any{
			"code":    "filter_decode_failed",
			"message": err.Error(),
		})
		h.emitMRAudit(r.Context(), audit.EventReportGenerate, principal, reportIDStr, "", req.Filters, time.Time{}, "filter_decode_failed", rec.statusOr(http.StatusBadRequest))
		return
	}

	if vErr := (masterreport.Validator{}).Validate(def, filters); vErr != nil {
		status := writeMRError(rec, vErr)
		h.emitMRAudit(r.Context(), audit.EventReportGenerate, principal, reportIDStr, "", req.Filters, time.Time{}, "filter_validation_failed", status)
		return
	}

	hash, err := masterreport.FilterHash(def, filters)
	if err != nil {
		status := writeMRError(rec, err)
		h.emitMRAudit(r.Context(), audit.EventReportGenerate, principal, reportIDStr, "", req.Filters, time.Time{}, "filter_hash_failed", status)
		return
	}

	opDate := operationalDateFor(def, filters, time.Now())

	// Run SmartLoader.Load on a detached background context so the work
	// survives the 30s sync window. If the sync wait wins, we cancel
	// the detached context to release resources promptly; if it
	// crosses 30s, the goroutine continues and SmartLoader's
	// singleflight coalesces with the JobRegistry-driven invocation.
	type loadOutcome struct {
		payload masterreport.Payload
		path    string
		err     error
	}
	workCtx, workCancel := context.WithTimeout(context.Background(), masterreport.JobMaxRuntime)
	done := make(chan loadOutcome, 1)
	go func() {
		defer workCancel()
		p, path, lerr := h.mrSmartLoad.Load(workCtx, reportID, hash, opDate, filters)
		done <- loadOutcome{p, path, lerr}
	}()

	select {
	case res := <-done:
		if res.err != nil {
			status := writeMRError(rec, res.err)
			h.emitMRAudit(r.Context(), audit.EventReportGenerate, principal, reportIDStr, hash, req.Filters, opDate, "recompute_failed", status)
			return
		}
		writeJSON(rec, http.StatusOK, map[string]any{
			"report_id":        string(def.ID),
			"filter_hash":      hash,
			"operational_date": opDate.Format("2006-01-02"),
			"path":             res.path,
			"payload":          res.payload,
			"computed_at":      res.payload.GeneratedAt,
		})
		h.emitMRAudit(r.Context(), audit.EventReportGenerate, principal, reportIDStr, hash, req.Filters, opDate, res.path, rec.statusOr(http.StatusOK))

	case <-time.After(30 * time.Second):
		// Hand off to JobRegistry. The original goroutine keeps
		// running; SmartLoader's singleflight collapses its
		// in-flight Compute with the job's invocation.
		jobKey := masterreport.JobKey{
			ReportID:        reportID,
			FilterHash:      hash,
			OperationalDate: opDate,
		}
		job, jerr := h.mrJobs.SubmitOrGet(r.Context(), jobKey, func(jobCtx context.Context) (masterreport.Payload, error) {
			p, _, lerr := h.mrSmartLoad.Load(jobCtx, reportID, hash, opDate, filters)
			return p, lerr
		})
		if jerr != nil {
			status := writeMRError(rec, jerr)
			h.emitMRAudit(r.Context(), audit.EventReportGenerate, principal, reportIDStr, hash, req.Filters, opDate, "job_submit_failed", status)
			return
		}
		writeJSON(rec, http.StatusAccepted, map[string]any{
			"job_id":      job.ID,
			"status":      string(job.Status),
			"report_id":   string(def.ID),
			"filter_hash": hash,
		})
		h.emitMRAudit(r.Context(), audit.EventReportGenerate, principal, reportIDStr, hash, req.Filters, opDate, "async_handoff", rec.statusOr(http.StatusAccepted))
	}
}

// ForceRecalculate runs ForceRecalculator.Recalculate after validating
// the filters and computing their hash. Unlike GenerateReport this
// handler runs synchronously — admin force-recalculations are issued
// with the expectation of waiting for the result; the 30s threshold is
// not applied here (design §15.3 lists only a 200 sync response).
//
// Permission gating (both reports.<id>.view AND reports.force_recalculate)
// is owned by the router middleware in task 15.3; this handler does not
// re-check.
func (h *Handler) ForceRecalculate(w http.ResponseWriter, r *http.Request) {
	rec := &statusRecorder{ResponseWriter: w}
	if !h.mrAvailable() {
		writeMRUnavailable(rec)
		return
	}
	principal := resolvePrincipal(r)

	reportIDStr := chi.URLParam(r, "report_id")
	reportID := masterreport.ReportID(reportIDStr)

	def, ok := h.mrCatalog.Get(reportID)
	if !ok {
		writeJSONError(rec, http.StatusNotFound, map[string]any{
			"code":    "report_not_found",
			"message": fmt.Sprintf("unknown report_id %q", reportIDStr),
		})
		h.emitMRAudit(r.Context(), audit.EventReportForceRecalculate, principal, reportIDStr, "", nil, time.Time{}, "report_not_found", rec.statusOr(http.StatusNotFound))
		return
	}

	req, derr := decodeGenerateBody(r)
	if derr != nil {
		writeJSONError(rec, http.StatusBadRequest, map[string]any{
			"code":    "invalid_request_body",
			"message": derr.Error(),
		})
		h.emitMRAudit(r.Context(), audit.EventReportForceRecalculate, principal, reportIDStr, "", nil, time.Time{}, "invalid_request_body", rec.statusOr(http.StatusBadRequest))
		return
	}

	filters, err := decodeFilterPayload(def, req.Filters)
	if err != nil {
		writeJSONError(rec, http.StatusBadRequest, map[string]any{
			"code":    "filter_decode_failed",
			"message": err.Error(),
		})
		h.emitMRAudit(r.Context(), audit.EventReportForceRecalculate, principal, reportIDStr, "", req.Filters, time.Time{}, "filter_decode_failed", rec.statusOr(http.StatusBadRequest))
		return
	}

	if vErr := (masterreport.Validator{}).Validate(def, filters); vErr != nil {
		status := writeMRError(rec, vErr)
		h.emitMRAudit(r.Context(), audit.EventReportForceRecalculate, principal, reportIDStr, "", req.Filters, time.Time{}, "filter_validation_failed", status)
		return
	}

	hash, err := masterreport.FilterHash(def, filters)
	if err != nil {
		status := writeMRError(rec, err)
		h.emitMRAudit(r.Context(), audit.EventReportForceRecalculate, principal, reportIDStr, "", req.Filters, time.Time{}, "filter_hash_failed", status)
		return
	}

	opDate := operationalDateFor(def, filters, time.Now())

	payload, path, lerr := h.mrForceRecal.Recalculate(r.Context(), reportID, hash, opDate, filters)
	if lerr != nil {
		status := writeMRError(rec, lerr)
		h.emitMRAudit(r.Context(), audit.EventReportForceRecalculate, principal, reportIDStr, hash, req.Filters, opDate, "recompute_failed", status)
		return
	}

	writeJSON(rec, http.StatusOK, map[string]any{
		"report_id":        string(def.ID),
		"filter_hash":      hash,
		"operational_date": opDate.Format("2006-01-02"),
		"path":             path,
		"payload":          payload,
		"computed_at":      payload.GeneratedAt,
	})
	h.emitMRAudit(r.Context(), audit.EventReportForceRecalculate, principal, reportIDStr, hash, req.Filters, opDate, path, rec.statusOr(http.StatusOK))
}

// ExportExcel resolves filters from URL query parameters, runs
// SmartLoader.Load to obtain the payload, then streams the .xlsx
// rendering via ExcelExporter.Export. The exporter is responsible for
// committing Content-Type / Content-Disposition only after the in-memory
// fill succeeds (Req 4.6); this handler simply propagates exporter
// errors through writeMRError when nothing has been written to the
// response yet.
//
// Note: SmartLoader.Load is invoked synchronously with the request
// context — Excel exports do not use the 30s sync threshold or the
// JobRegistry hand-off (design §15.4 describes a streaming response
// only).
func (h *Handler) ExportExcel(w http.ResponseWriter, r *http.Request) {
	rec := &statusRecorder{ResponseWriter: w}
	if !h.mrAvailable() {
		writeMRUnavailable(rec)
		return
	}
	principal := resolvePrincipal(r)

	reportIDStr := chi.URLParam(r, "report_id")
	reportID := masterreport.ReportID(reportIDStr)

	def, ok := h.mrCatalog.Get(reportID)
	if !ok {
		writeJSONError(rec, http.StatusNotFound, map[string]any{
			"code":    "report_not_found",
			"message": fmt.Sprintf("unknown report_id %q", reportIDStr),
		})
		h.emitMRAudit(r.Context(), audit.EventReportExportExcel, principal, reportIDStr, "", nil, time.Time{}, "report_not_found", rec.statusOr(http.StatusNotFound))
		return
	}

	raw := decodeFiltersFromRequest(r)
	filters, err := decodeFilterPayload(def, raw)
	if err != nil {
		writeJSONError(rec, http.StatusBadRequest, map[string]any{
			"code":    "filter_decode_failed",
			"message": err.Error(),
		})
		h.emitMRAudit(r.Context(), audit.EventReportExportExcel, principal, reportIDStr, "", raw, time.Time{}, "filter_decode_failed", rec.statusOr(http.StatusBadRequest))
		return
	}

	if vErr := (masterreport.Validator{}).Validate(def, filters); vErr != nil {
		status := writeMRError(rec, vErr)
		h.emitMRAudit(r.Context(), audit.EventReportExportExcel, principal, reportIDStr, "", raw, time.Time{}, "filter_validation_failed", status)
		return
	}

	hash, err := masterreport.FilterHash(def, filters)
	if err != nil {
		status := writeMRError(rec, err)
		h.emitMRAudit(r.Context(), audit.EventReportExportExcel, principal, reportIDStr, "", raw, time.Time{}, "filter_hash_failed", status)
		return
	}

	opDate := operationalDateFor(def, filters, time.Now())

	payload, _, lerr := h.mrSmartLoad.Load(r.Context(), reportID, hash, opDate, filters)
	if lerr != nil {
		status := writeMRError(rec, lerr)
		h.emitMRAudit(r.Context(), audit.EventReportExportExcel, principal, reportIDStr, hash, raw, opDate, "recompute_failed", status)
		return
	}

	if xerr := h.mrExcel.Export(r.Context(), def, payload, opDate, rec); xerr != nil {
		// If headers have not yet been committed (statusRecorder
		// has no recorded status) we can still surface a JSON
		// error envelope; otherwise the response is partially
		// written and we surface the error via audit only.
		if rec.status == 0 {
			status := writeMRError(rec, xerr)
			h.emitMRAudit(r.Context(), audit.EventReportExportExcel, principal, reportIDStr, hash, raw, opDate, "export_failed", status)
		} else {
			h.emitMRAudit(r.Context(), audit.EventReportExportExcel, principal, reportIDStr, hash, raw, opDate, "export_stream_failed", rec.statusOr(http.StatusInternalServerError))
		}
		return
	}
	h.emitMRAudit(r.Context(), audit.EventReportExportExcel, principal, reportIDStr, hash, raw, opDate, "ok", rec.statusOr(http.StatusOK))
}

// ExportPDF mirrors ExportExcel, calling PDFExporter.Export after
// SmartLoader.Load. The PDF exporter wraps its render in a 30-second
// timeout per Req 5.6 and returns ErrPDFRecomputeTimeout / ErrExportTooWide
// for the timeout and too-wide cases; classifyError maps both to the
// design §15.5 error envelopes.
func (h *Handler) ExportPDF(w http.ResponseWriter, r *http.Request) {
	rec := &statusRecorder{ResponseWriter: w}
	if !h.mrAvailable() {
		writeMRUnavailable(rec)
		return
	}
	principal := resolvePrincipal(r)

	reportIDStr := chi.URLParam(r, "report_id")
	reportID := masterreport.ReportID(reportIDStr)

	def, ok := h.mrCatalog.Get(reportID)
	if !ok {
		writeJSONError(rec, http.StatusNotFound, map[string]any{
			"code":    "report_not_found",
			"message": fmt.Sprintf("unknown report_id %q", reportIDStr),
		})
		h.emitMRAudit(r.Context(), audit.EventReportExportPDF, principal, reportIDStr, "", nil, time.Time{}, "report_not_found", rec.statusOr(http.StatusNotFound))
		return
	}

	raw := decodeFiltersFromRequest(r)
	filters, err := decodeFilterPayload(def, raw)
	if err != nil {
		writeJSONError(rec, http.StatusBadRequest, map[string]any{
			"code":    "filter_decode_failed",
			"message": err.Error(),
		})
		h.emitMRAudit(r.Context(), audit.EventReportExportPDF, principal, reportIDStr, "", raw, time.Time{}, "filter_decode_failed", rec.statusOr(http.StatusBadRequest))
		return
	}

	if vErr := (masterreport.Validator{}).Validate(def, filters); vErr != nil {
		status := writeMRError(rec, vErr)
		h.emitMRAudit(r.Context(), audit.EventReportExportPDF, principal, reportIDStr, "", raw, time.Time{}, "filter_validation_failed", status)
		return
	}

	hash, err := masterreport.FilterHash(def, filters)
	if err != nil {
		status := writeMRError(rec, err)
		h.emitMRAudit(r.Context(), audit.EventReportExportPDF, principal, reportIDStr, "", raw, time.Time{}, "filter_hash_failed", status)
		return
	}

	opDate := operationalDateFor(def, filters, time.Now())

	payload, _, lerr := h.mrSmartLoad.Load(r.Context(), reportID, hash, opDate, filters)
	if lerr != nil {
		status := writeMRError(rec, lerr)
		h.emitMRAudit(r.Context(), audit.EventReportExportPDF, principal, reportIDStr, hash, raw, opDate, "recompute_failed", status)
		return
	}

	if xerr := h.mrPDF.Export(r.Context(), def, payload, opDate, rec); xerr != nil {
		if rec.status == 0 {
			status := writeMRError(rec, xerr)
			h.emitMRAudit(r.Context(), audit.EventReportExportPDF, principal, reportIDStr, hash, raw, opDate, "export_failed", status)
		} else {
			h.emitMRAudit(r.Context(), audit.EventReportExportPDF, principal, reportIDStr, hash, raw, opDate, "export_stream_failed", rec.statusOr(http.StatusInternalServerError))
		}
		return
	}
	h.emitMRAudit(r.Context(), audit.EventReportExportPDF, principal, reportIDStr, hash, raw, opDate, "ok", rec.statusOr(http.StatusOK))
}

// GetJob polls JobRegistry for the job identified by {job_id}. Unknown
// IDs and IDs older than the 24-hour retention window surface as 404
// with {"error":{"code":"job_not_found"}} (Req 11.7).
//
// This handler does not emit an audit row — polling a job is not a
// security-relevant event in the design's audit catalogue (design §12)
// and the polling cadence would otherwise spam the audit_log table.
func (h *Handler) GetJob(w http.ResponseWriter, r *http.Request) {
	rec := &statusRecorder{ResponseWriter: w}
	if !h.mrAvailable() {
		writeMRUnavailable(rec)
		return
	}

	jobID := chi.URLParam(r, "job_id")
	job, err := h.mrJobs.Poll(r.Context(), jobID)
	if err != nil {
		if errors.Is(err, masterreport.ErrJobNotFound) {
			writeJSONError(rec, http.StatusNotFound, map[string]any{
				"code": "job_not_found",
			})
			return
		}
		writeMRError(rec, err)
		return
	}

	resp := map[string]any{
		"id":           job.ID,
		"status":       string(job.Status),
		"submitted_at": job.SubmittedAt,
	}
	if !job.StartedAt.IsZero() {
		resp["started_at"] = job.StartedAt
	}
	if !job.CompletedAt.IsZero() {
		resp["completed_at"] = job.CompletedAt
	}
	if job.Status == masterreport.JobDone && len(job.Payload) > 0 {
		resp["payload"] = json.RawMessage(job.Payload)
	}
	if job.Status == masterreport.JobError && job.ErrorReason != "" {
		resp["error_reason"] = job.ErrorReason
	}
	writeJSON(rec, http.StatusOK, resp)
}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

// decodeGenerateBody parses a generate / recalculate request body. An
// empty body is treated as {"filters": {}} so handlers downstream still
// produce a deterministic FilterValidator error against the report's
// declared required filters rather than failing on JSON parse.
func decodeGenerateBody(r *http.Request) (*generateRequest, error) {
	req := &generateRequest{Filters: map[string]any{}}
	if r.Body == nil {
		return req, nil
	}
	// Allow zero-length bodies (e.g. GET-style force-recalcs from
	// future-clients) by sniffing Content-Length first.
	if r.ContentLength == 0 {
		return req, nil
	}
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(req); err != nil {
		return nil, err
	}
	if req.Filters == nil {
		req.Filters = map[string]any{}
	}
	return req, nil
}

// decodeFiltersFromRequest reads filters from either the JSON body (for
// POST requests) or the URL query string (for GET exports). The Excel
// and PDF export endpoints support both forms per design §15.4 — the
// query string is convenient for typical "click to download" links,
// while a POST body is the natural shape for filters that exceed URL
// length limits.
func decodeFiltersFromRequest(r *http.Request) map[string]any {
	if r.Method == http.MethodPost && r.ContentLength != 0 {
		req, err := decodeGenerateBody(r)
		if err == nil {
			return req.Filters
		}
	}
	return queryToRawFilters(r)
}

// emitMRAudit is the single call-site that builds the master-report
// audit metadata map and invokes Auditor.EmitWithBudget. The
// `outcome` argument is the handler-specific string (cache_hit,
// recomputed, async_handoff, filter_validation_failed, etc.) and the
// httpStatus argument is the value captured by the statusRecorder so
// the audit row reflects what the client actually observed.
func (h *Handler) emitMRAudit(
	ctx context.Context,
	action audit.EventType,
	p principalInfo,
	reportID, filterHash string,
	rawFilters map[string]any,
	opDate time.Time,
	outcome string,
	httpStatus int,
) {
	if h.mrAuditor == nil {
		return
	}
	md := map[string]any{
		"report_id":     reportID,
		"filter_hash":   filterHash,
		"outcome":       outcome,
		"http_status":   httpStatus,
		"request_ts_ms": time.Now().UTC().UnixMilli(),
	}
	if rawFilters != nil {
		md["filters"] = rawFilters
	}
	if !opDate.IsZero() {
		md["operational_date"] = opDate.UTC().Format("2006-01-02")
	}
	h.mrAuditor.EmitWithBudget(ctx, action, p.userID, p.email, p.ip, md)
}
