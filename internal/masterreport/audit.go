// Package masterreport contains the Master Consolidated Reporting Module.
//
// This file implements the audit emit wrapper that every HTTP handler in the
// module calls before returning a response. It enforces the 500 ms emit
// budget required by Requirement 10.2 and normalises the metadata shape
// described in Requirement 10.1 and design §12.2.
//
// Behaviour summary:
//
//   - The wrapper launches `audit.Logger.Log` in a goroutine that signals a
//     buffered `done` channel when it returns. The caller waits on a
//     `select { case <-done: case <-time.After(500*time.Millisecond): }`,
//     so the response is never delayed by more than 500 ms by audit work
//     (Req 10.2). The inner goroutine — and the goroutine that
//     `audit.Logger.Log` itself starts to persist the row — may complete
//     after the wrapper has returned.
//
//   - The caller supplies a report-specific metadata map (`report_id`,
//     `filter_hash`, `filters`, `operational_date`, `outcome`, `http_status`,
//     etc.). The wrapper merges in `request_ts_ms`, normalises the
//     `filters` field by JSON-encoding any non-byte/non-string value and
//     truncating it at 16 384 bytes (setting `filters_truncated: true` when
//     truncated), and adds the anonymous-fallback fields when applicable.
//
//   - Unauthenticated requests are signalled by a sentinel `userID == 0`
//     and/or an empty `email`. In that case the wrapper sets the metadata
//     keys `user_id = "anonymous"` and `email = "anonymous"` (Req 10.3) and
//     forwards `"anonymous"` to `audit.Logger.Log` as the `email` argument
//     so the audit row is self-describing even though the underlying
//     `audit.Log` signature still expects an integer `userID`.
//
//   - Emit failures (logger nil, panic in the inner goroutine, exceeded
//     500 ms budget) are logged at `error` level with `user_id`, `action`,
//     `report_id`, and `filter_hash`, and never block or alter the
//     response (Req 10.4). Persistence runs exclusively through the
//     existing `internal/audit` package; no separate store is introduced
//     (Req 10.5).
//
// Requirements covered: 10.1, 10.2, 10.3, 10.4, 10.5.
package masterreport

import (
	"context"
	"encoding/json"
	"time"

	"github.com/rs/zerolog/log"

	"gps-tracking-system/internal/audit"
)

// AuditEmitBudget caps how long EmitWithBudget waits on the inner goroutine
// before returning. The inner goroutine may continue running afterwards;
// only the *wait* is bounded (Req 10.2).
const AuditEmitBudget = 500 * time.Millisecond

// AuditFiltersMaxBytes is the upper bound on the JSON-encoded `filters`
// metadata field. Payloads longer than this are truncated to the first
// AuditFiltersMaxBytes bytes and the `filters_truncated` flag is set to
// `true` (Req 10.1).
const AuditFiltersMaxBytes = 16384

// auditAnonymous is the literal string written to `user_id` and `email`
// metadata fields when the request arrives without a resolvable
// authenticated principal (Req 10.3).
const auditAnonymous = "anonymous"

// auditSink is the minimal interface EmitWithBudget needs from a
// persistence backend. The production binding is *audit.Logger; the
// property test in audit_property_test.go substitutes an in-memory
// recorder that satisfies the same method set so we can drive the
// wrapper without standing up a PostgreSQL pool.
//
// Keeping this type unexported preserves NewAuditor's public signature
// (which still accepts *audit.Logger directly) while letting the field
// type be substituted in tests via newAuditorWithSink.
type auditSink interface {
	Log(ctx context.Context, event audit.EventType, userID int, email, ip string, metadata map[string]any)
}

// Auditor wraps an audit sink with the Master_Reporting_Module emit
// budget and metadata normalisation. A nil Auditor is a valid zero value
// that logs at error level without persisting — this keeps unit tests and
// boot-order errors from panicking the request path.
type Auditor struct {
	logger auditSink
}

// NewAuditor returns an Auditor that forwards to the given audit.Logger.
// The logger may be nil; in that case every EmitWithBudget call records an
// error-level log line and returns (Req 10.4 still holds: the response is
// not altered).
//
// A nil *audit.Logger is converted to a nil sink rather than a typed-nil
// interface so the `a.logger == nil` check inside EmitWithBudget keeps
// working exactly as before.
func NewAuditor(logger *audit.Logger) *Auditor {
	if logger == nil {
		return &Auditor{logger: nil}
	}
	return &Auditor{logger: logger}
}

// EmitWithBudget records a single audit event for a Master_Reporting_Module
// HTTP request. It is non-blocking from the caller's perspective beyond at
// most AuditEmitBudget of wait time.
//
// Arguments:
//
//   - ctx       — request context (forwarded to audit.Logger.Log; the audit
//     package writes with context.Background internally so cancellation of
//     ctx does not abort the persisted record).
//   - action    — one of audit.EventReportGenerate,
//     audit.EventReportForceRecalculate, audit.EventReportExportExcel,
//     audit.EventReportExportPDF.
//   - userID    — authenticated principal's id; pass 0 for anonymous
//     requests (the underlying audit table column stays integer; the
//     anonymous designation is reflected in metadata).
//   - email, ip — authenticated principal's email and request IP; empty
//     email triggers anonymous fallback in metadata.
//   - metadata  — caller-supplied report-specific metadata. The wrapper
//     does not mutate this map; it copies before merging in
//     `request_ts_ms` and the anonymous-fallback fields.
//
// EmitWithBudget never panics. Internal panics in the audit goroutine are
// recovered and logged.
func (a *Auditor) EmitWithBudget(
	ctx context.Context,
	action audit.EventType,
	userID int,
	email, ip string,
	metadata map[string]any,
) {
	// Defensive copy so the caller's map is not mutated while the audit
	// goroutine may still be reading it. Capacity grows for the merged
	// standard fields (request_ts_ms, user_id, email, filters_truncated).
	md := make(map[string]any, len(metadata)+4)
	for k, v := range metadata {
		md[k] = v
	}

	// Anonymous fallback (Req 10.3). userID == 0 is the sentinel agreed
	// with the HTTP layer for "no resolvable principal"; an empty email
	// is treated the same way so we don't emit blank strings.
	emailForLog := email
	if userID == 0 {
		md["user_id"] = auditAnonymous
	}
	if emailForLog == "" {
		md["email"] = auditAnonymous
		emailForLog = auditAnonymous
	}

	// Standardised request timestamp in UTC milliseconds. Caller may
	// override by setting the same key; the override wins so tests can
	// pin a deterministic value.
	if _, ok := md["request_ts_ms"]; !ok {
		md["request_ts_ms"] = time.Now().UTC().UnixMilli()
	}

	// Normalise the `filters` field. The caller may pass either a
	// pre-encoded JSON []byte / string / json.RawMessage, or a structured
	// FilterPayload / map. We always end up with a string value bounded
	// at AuditFiltersMaxBytes bytes. When the wrapper truncates, it sets
	// `filters_truncated: true`; otherwise the flag is recorded as
	// `false` so consumers can rely on its presence (Req 10.1).
	if raw, ok := md["filters"]; ok && raw != nil {
		encoded, encodeErr := encodeFilters(raw)
		if encodeErr == nil {
			if len(encoded) > AuditFiltersMaxBytes {
				md["filters"] = string(encoded[:AuditFiltersMaxBytes])
				md["filters_truncated"] = true
			} else {
				md["filters"] = string(encoded)
				if _, present := md["filters_truncated"]; !present {
					md["filters_truncated"] = false
				}
			}
		} else {
			// Encoding failed; log and keep the raw value out of the
			// metadata so we don't accidentally emit a non-serialisable
			// payload downstream. Audit emission proceeds.
			md["filters"] = ""
			md["filters_truncated"] = false
			log.Error().
				Err(encodeErr).
				Str("action", string(action)).
				Msg("masterreport audit: failed to encode filters; emitting empty filters")
		}
	}

	// Pull report_id / filter_hash up front so we can include them in any
	// error log line without re-asserting types inside the goroutine.
	reportID, _ := md["report_id"].(string)
	filterHash, _ := md["filter_hash"].(string)

	// Buffered so the inner goroutine never blocks on send, even if the
	// outer select has already returned via the timeout case.
	done := make(chan struct{}, 1)

	go func() {
		defer func() {
			// Recover any panic from audit.Logger.Log so the emit
			// goroutine never crashes the process. Log at error level
			// with the identifying fields demanded by Req 10.4.
			if r := recover(); r != nil {
				log.Error().
					Interface("panic", r).
					Str("action", string(action)).
					Int("user_id", userID).
					Str("report_id", reportID).
					Str("filter_hash", filterHash).
					Msg("masterreport audit: panic in emit goroutine")
			}
			// Always signal completion. The send is non-blocking
			// because `done` is buffered with capacity 1; if the
			// outer select has already fired its timeout case it
			// will never receive, but the buffered slot absorbs the
			// send without leaking the goroutine.
			select {
			case done <- struct{}{}:
			default:
			}
		}()

		if a == nil || a.logger == nil {
			// No backing audit logger. Record the failure so it
			// can be reconciled later, but do not block or fail the
			// response (Req 10.4).
			log.Error().
				Str("action", string(action)).
				Int("user_id", userID).
				Str("report_id", reportID).
				Str("filter_hash", filterHash).
				Msg("masterreport audit: no audit logger configured; event not persisted")
			return
		}

		// internal/audit.Logger.Log persists exclusively through the
		// shared audit_log table (Req 10.5). It already runs its own
		// goroutine internally, so this call returns nearly instantly
		// and the buffered done send below fires immediately. The 500
		// ms budget exists to bound any future change where Log
		// becomes synchronous (e.g., a flushing wrapper).
		a.logger.Log(ctx, action, userID, emailForLog, ip, md)
	}()

	select {
	case <-done:
		// Inner goroutine finished within budget; nothing to do.
	case <-time.After(AuditEmitBudget):
		// Emit budget exceeded. The inner goroutine continues; the
		// buffered `done` channel allows it to signal completion
		// without leaking. Log at error level with the identifying
		// fields demanded by Req 10.4. The response is not altered.
		log.Error().
			Dur("budget", AuditEmitBudget).
			Str("action", string(action)).
			Int("user_id", userID).
			Str("report_id", reportID).
			Str("filter_hash", filterHash).
			Msg("masterreport audit: emit exceeded budget; response returned without waiting")
	}
}

// encodeFilters reduces an arbitrary filters value to its canonical JSON
// byte representation:
//
//   - []byte and json.RawMessage are returned unchanged.
//   - string is returned as its UTF-8 bytes (assumed to already be JSON;
//     this preserves caller-supplied canonical forms produced by
//     FilterHash).
//   - any other value is run through encoding/json.Marshal.
//
// Returning an error allows the caller to log and degrade gracefully
// rather than panic on a non-serialisable filter value.
func encodeFilters(v any) ([]byte, error) {
	switch val := v.(type) {
	case nil:
		return []byte("null"), nil
	case []byte:
		return val, nil
	case json.RawMessage:
		return []byte(val), nil
	case string:
		return []byte(val), nil
	default:
		return json.Marshal(v)
	}
}
