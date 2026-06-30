package masterreport

// audit_property_test.go — task 12.3 (Property 10).
//
// Property 10: Audit Completeness.
//
// For any sequence of Master_Reporting_Module HTTP requests across the
// four audited actions (Generate, Force_Recalculate, Export-to-Excel,
// Export-to-PDF), the audit wrapper Auditor.EmitWithBudget must:
//
//  1. Persist exactly one audit record per request (Req 10.1) — the
//     event/action, userID, email, and the metadata fields report_id,
//     filter_hash, and http_status carried by the record must each match
//     what the caller passed in.
//  2. Apply the anonymous fallback (Req 10.3) — when userID is the
//     anonymous sentinel 0, metadata "user_id" is the literal string
//     "anonymous"; when email is empty, both metadata "email" and the
//     downstream email argument are "anonymous".
//  3. Return the response even when the audit emit itself fails
//     (Req 10.4) — for a nil sink, a panicking sink, or a sink that
//     blocks beyond the 500 ms budget, EmitWithBudget must return
//     without panicking and within budget + a small scheduler slack.
//
// The test drives a rapid-generated request batch through EmitWithBudget
// against an in-memory recorderSink that captures every Log call. Because
// the wrapper waits on its done channel before returning (or on the budget
// timeout), the inner goroutine's append to the recorder is observed
// before EmitWithBudget returns, so the recorder's row slice preserves
// submission order and is safe to compare positionally.
//
// Validates: Requirements 10.1, 10.4

import (
	"context"
	"sync"
	"testing"
	"time"

	"pgregory.net/rapid"

	"gps-tracking-system/internal/audit"
)

// auditActions enumerates the four EventType values that the
// Master_Reporting_Module emits per Req 10.1. The property holds across
// every choice from this set, so rapid samples uniformly from it.
var auditActions = []audit.EventType{
	audit.EventReportGenerate,
	audit.EventReportForceRecalculate,
	audit.EventReportExportExcel,
	audit.EventReportExportPDF,
}

// auditStatusCodes is a representative success/error mix drawn from the
// 100–599 range mandated by Req 10.1. Each rapid trial picks per-request
// from this slice so a single batch contains a realistic blend of 2xx
// successes and 4xx/5xx errors.
var auditStatusCodes = []int{200, 201, 202, 204, 400, 401, 403, 404, 409, 500, 502, 503}

// recorderRow is one observation of Auditor.EmitWithBudget made by the
// in-memory recorderSink. Fields mirror the auditSink.Log signature so
// the property assertions can compare positional arguments and the
// merged metadata map without re-deriving anything.
type recorderRow struct {
	event    audit.EventType
	userID   int
	email    string
	ip       string
	metadata map[string]any
}

// recorderSink is the in-memory test double substituted for the real
// *audit.Logger via newAuditorWithSink. It captures every Log call so
// the property test can assert per-request row count and field values.
// behave is an optional pre-append hook used by the emit-failure subtest
// to simulate panics and budget overruns; nil disables it.
type recorderSink struct {
	mu     sync.Mutex
	rows   []recorderRow
	behave func()
}

func (r *recorderSink) Log(ctx context.Context, event audit.EventType, userID int, email, ip string, metadata map[string]any) {
	if r.behave != nil {
		r.behave()
	}
	// Defensive copy of the wrapper's metadata map. EmitWithBudget owns
	// that map and is free to mutate it after Log returns; we want the
	// recorded snapshot to be stable.
	md := make(map[string]any, len(metadata))
	for k, v := range metadata {
		md[k] = v
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.rows = append(r.rows, recorderRow{
		event:    event,
		userID:   userID,
		email:    email,
		ip:       ip,
		metadata: md,
	})
}

// snapshot returns a stable copy of the recorded rows. Callers iterate
// over the snapshot so concurrent goroutines that might still be
// appending after EmitWithBudget returns (e.g., the slow-sink subtest)
// cannot disturb assertions.
func (r *recorderSink) snapshot() []recorderRow {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]recorderRow, len(r.rows))
	copy(out, r.rows)
	return out
}

// newAuditorWithSink builds an Auditor wired to the supplied test
// auditSink, bypassing NewAuditor's *audit.Logger parameter so the
// property test never touches PostgreSQL. Kept in the test file so the
// production audit.go has no test-only seams in its public surface.
func newAuditorWithSink(sink auditSink) *Auditor {
	return &Auditor{logger: sink}
}

// TestAuditCompleteness is Property 10 from the
// master-consolidated-reporting spec — the Audit Completeness property.
//
// Validates: Requirements 10.1, 10.4
func TestAuditCompleteness(t *testing.T) {
	t.Run("ExactlyOneRecordPerRequestWithMatchingFields", func(t *testing.T) {
		rapid.Check(t, func(rt *rapid.T) {
			n := rapid.IntRange(1, 50).Draw(rt, "n")

			type req struct {
				action     audit.EventType
				userID     int
				email      string
				ip         string
				reportID   string
				filterHash string
				httpStatus int
				outcome    string
			}

			requests := make([]req, n)
			for i := 0; i < n; i++ {
				// userID is drawn from a range that includes 0 (the
				// anonymous sentinel) so the anonymous fallback in
				// Req 10.3 is exercised on roughly 1 / (range+1) of
				// the trials. email is drawn from a regex that matches
				// the empty string OR a syntactically plausible address
				// so both authenticated and anonymous emails appear.
				requests[i] = req{
					action:     rapid.SampledFrom(auditActions).Draw(rt, "action"),
					userID:     rapid.IntRange(0, 1000).Draw(rt, "user_id"),
					email:      rapid.StringMatching(`(|[a-z]{1,8}@example\.com)`).Draw(rt, "email"),
					ip:         rapid.StringMatching(`(\d{1,3}\.){3}\d{1,3}`).Draw(rt, "ip"),
					reportID:   rapid.StringMatching(`[a-z][a-z_]{2,19}`).Draw(rt, "report_id"),
					filterHash: rapid.StringMatching(`[a-f0-9]{16}`).Draw(rt, "filter_hash"),
					httpStatus: rapid.SampledFrom(auditStatusCodes).Draw(rt, "http_status"),
					outcome:    rapid.SampledFrom([]string{"success", "error"}).Draw(rt, "outcome"),
				}
			}

			sink := &recorderSink{}
			a := newAuditorWithSink(sink)
			ctx := context.Background()

			for _, r := range requests {
				md := map[string]any{
					"report_id":   r.reportID,
					"filter_hash": r.filterHash,
					"http_status": r.httpStatus,
					"outcome":     r.outcome,
				}
				a.EmitWithBudget(ctx, r.action, r.userID, r.email, r.ip, md)
			}

			rows := sink.snapshot()
			if len(rows) != len(requests) {
				rt.Fatalf("expected exactly %d audit records (one per request), got %d", len(requests), len(rows))
			}

			// EmitWithBudget waits on its done channel before returning
			// for any sink whose Log returns under 500 ms (the recorder
			// returns instantly). That means rows[i] corresponds to
			// requests[i] in submission order, so positional comparison
			// is sound.
			for i, want := range requests {
				got := rows[i]

				if got.event != want.action {
					rt.Fatalf("record %d: action mismatch: want %q got %q", i, want.action, got.event)
				}
				if got.userID != want.userID {
					rt.Fatalf("record %d: userID arg mismatch: want %d got %d", i, want.userID, got.userID)
				}

				// Anonymous fallback assertions (Req 10.3) — userID == 0
				// must surface as metadata user_id = "anonymous"; a
				// non-zero userID must NOT have the wrapper override
				// metadata user_id (the caller's integer arg is the
				// authoritative identity in that branch).
				if want.userID == 0 {
					if got.metadata["user_id"] != auditAnonymous {
						rt.Fatalf("record %d: userID==0 expected metadata user_id=%q, got %v",
							i, auditAnonymous, got.metadata["user_id"])
					}
				}

				// email fallback (Req 10.3) — empty email must surface
				// both as metadata "email" = "anonymous" AND as the
				// email argument forwarded into Log. Non-empty email
				// must round-trip unchanged in the email argument.
				if want.email == "" {
					if got.metadata["email"] != auditAnonymous {
						rt.Fatalf("record %d: empty email expected metadata email=%q, got %v",
							i, auditAnonymous, got.metadata["email"])
					}
					if got.email != auditAnonymous {
						rt.Fatalf("record %d: empty email expected email arg=%q, got %q",
							i, auditAnonymous, got.email)
					}
				} else {
					if got.email != want.email {
						rt.Fatalf("record %d: email arg mismatch: want %q got %q", i, want.email, got.email)
					}
				}

				// IP is forwarded verbatim with no normalisation in the
				// current wrapper; assert that contract so any future
				// regression that silently rewrites IPs surfaces here.
				if got.ip != want.ip {
					rt.Fatalf("record %d: ip mismatch: want %q got %q", i, want.ip, got.ip)
				}

				// The three metadata fields the spec calls out by name:
				// report_id, filter_hash, http_status (Req 10.1).
				if got.metadata["report_id"] != want.reportID {
					rt.Fatalf("record %d: report_id mismatch: want %q got %v", i, want.reportID, got.metadata["report_id"])
				}
				if got.metadata["filter_hash"] != want.filterHash {
					rt.Fatalf("record %d: filter_hash mismatch: want %q got %v", i, want.filterHash, got.metadata["filter_hash"])
				}
				if got.metadata["http_status"] != want.httpStatus {
					rt.Fatalf("record %d: http_status mismatch: want %d got %v", i, want.httpStatus, got.metadata["http_status"])
				}
				if got.metadata["outcome"] != want.outcome {
					rt.Fatalf("record %d: outcome mismatch: want %q got %v", i, want.outcome, got.metadata["outcome"])
				}
			}
		})
	})

	// Emit-failure invariant (Req 10.4): regardless of how the audit
	// sink misbehaves, EmitWithBudget must return without panicking and
	// within the 500 ms budget plus a small scheduler slack. The
	// response itself is owned by the caller; this test asserts the
	// wrapper's contract that lets the caller return that response
	// promptly.
	t.Run("EmitFailureStillReturnsResponse", func(t *testing.T) {
		// nilLogger and panic-on-Log are both expected to return
		// nearly instantly — the wrapper short-circuits on a nil sink
		// and recovers from a panicking one. We allow a generous 100 ms
		// of scheduler slack so the assertion is robust under load.
		t.Run("NilSinkAndPanickingSinkReturnImmediately", func(t *testing.T) {
			rapid.Check(t, func(rt *rapid.T) {
				n := rapid.IntRange(1, 30).Draw(rt, "n")
				ctx := context.Background()

				for i := 0; i < n; i++ {
					action := rapid.SampledFrom(auditActions).Draw(rt, "action")
					mode := rapid.SampledFrom([]string{"nil_sink", "panicking_sink"}).Draw(rt, "mode")

					var a *Auditor
					switch mode {
					case "nil_sink":
						a = NewAuditor(nil)
					case "panicking_sink":
						a = newAuditorWithSink(&recorderSink{
							behave: func() { panic("simulated audit sink failure") },
						})
					}

					md := map[string]any{
						"report_id":   "any_report",
						"filter_hash": "deadbeefdeadbeef",
						"http_status": 200,
						"outcome":     "success",
					}

					start := time.Now()
					// If EmitWithBudget panics on either failure mode,
					// rapid will fail this trial with the panic stack —
					// no extra recover here, the wrapper is the unit
					// under test.
					a.EmitWithBudget(ctx, action, 1, "u@example.com", "127.0.0.1", md)
					elapsed := time.Since(start)

					// 100 ms is two orders of magnitude below the
					// 500 ms budget; if either failure path waits this
					// long the wrapper is no longer non-blocking on the
					// response path.
					if elapsed > 100*time.Millisecond {
						rt.Fatalf("EmitWithBudget blocked under failure mode %q: elapsed=%s (action=%q)",
							mode, elapsed, action)
					}
				}
			})
		})

		// Budget-timeout path: a sink that intentionally sleeps past
		// the 500 ms budget must NOT delay EmitWithBudget beyond the
		// budget itself. Run once deterministically (not under rapid.Check)
		// because each call costs ~500 ms of wall time and the property —
		// "the wait is bounded by AuditEmitBudget" — does not generalise
		// over a useful input space.
		t.Run("SlowSinkReturnsAtBudget", func(t *testing.T) {
			slack := 200 * time.Millisecond
			sleep := AuditEmitBudget + 100*time.Millisecond
			sink := &recorderSink{behave: func() { time.Sleep(sleep) }}
			a := newAuditorWithSink(sink)

			md := map[string]any{
				"report_id":   "slow_report",
				"filter_hash": "abcdef0123456789",
				"http_status": 200,
				"outcome":     "success",
			}

			start := time.Now()
			a.EmitWithBudget(context.Background(), audit.EventReportGenerate, 7, "slow@example.com", "10.0.0.1", md)
			elapsed := time.Since(start)

			if elapsed > AuditEmitBudget+slack {
				t.Fatalf("slow sink delayed wrapper past budget: elapsed=%s (budget=%s, slack=%s)",
					elapsed, AuditEmitBudget, slack)
			}
			if elapsed < AuditEmitBudget-slack {
				// Defensive sanity check: if the wrapper returns *before*
				// the budget under a slow sink, something is short-
				// circuiting the wait and we want to know.
				t.Fatalf("slow sink wrapper returned before budget: elapsed=%s (budget=%s)",
					elapsed, AuditEmitBudget)
			}
		})
	})
}
