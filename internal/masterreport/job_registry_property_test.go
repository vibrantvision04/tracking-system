package masterreport

// job_registry_property_test.go — task 9.2 (Property 12).
//
// Property 12: Async Job State Machine.
//
// For every Job tracked by a JobRegistry, the observable lifecycle is the
// strictly forward state machine:
//
//	pending  →  running  →  done | error
//
// No backward transitions occur, no state is skipped, and the terminal
// states are absorbing. On top of that core invariant the registry exposes
// four behavioural sub-properties that this file checks individually:
//
//   (A) Status sequence monotonicity — a job started with a controllable
//       run function transitions pending → running → done in that exact
//       order, never out of order and never skipping running.
//
//   (B) Submission latency bound — SubmitOrGet returns to the caller in
//       well under 1 second even when run is slow, so the HTTP layer can
//       emit a 202 within the Req 11.2 "1s of crossing the 30s threshold"
//       budget. The handoff is non-blocking by design (a goroutine drives
//       run); a generous 100ms ceiling here is two orders of magnitude
//       inside the spec budget.
//
//   (C) Concurrent same-key dedup — N simultaneous SubmitOrGet calls with
//       the same JobKey collapse onto one in-flight Job: every caller
//       observes the same Job.ID, the run function is invoked exactly
//       once, and every call returns within 200ms (Req 11.3).
//
//   (D) 15-minute ceiling — when run blocks past r.runTimeout the registry
//       marks the job as error with reason "async_ceiling_exceeded" and
//       cancels the context passed to run, which is the mechanism by
//       which downstream Bounded_Worker_Pool slots are released
//       (Req 11.5).
//
// Validates: Requirements 11.2, 11.3, 11.4, 11.5

import (
	"context"
	"encoding/json"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"pgregory.net/rapid"
)

// pollUntil repeatedly calls r.Poll(id) until pred returns true or the
// deadline elapses. It returns the last snapshot it observed plus a bool
// indicating whether pred ever held. A 1ms tick is fast enough to catch
// the brief pending and running windows our tests deliberately create.
func pollUntil(t *testing.T, r *JobRegistry, id string, deadline time.Duration, pred func(*Job) bool) (*Job, bool) {
	t.Helper()
	end := time.Now().Add(deadline)
	var last *Job
	for {
		j, err := r.Poll(context.Background(), id)
		if err == nil {
			last = j
			if pred(j) {
				return j, true
			}
		}
		if time.Now().After(end) {
			return last, false
		}
		time.Sleep(1 * time.Millisecond)
	}
}

// newTestRegistry constructs a JobRegistry whose cleanup goroutine is
// scoped to the test and whose runTimeout is short enough to exercise the
// 15-minute ceiling without making tests sleep for minutes. Defaults that
// are not overridden retain their production values.
func newTestRegistry(t *testing.T, runTimeout time.Duration) *JobRegistry {
	t.Helper()
	r := NewJobRegistry(context.Background())
	if runTimeout > 0 {
		r.runTimeout = runTimeout
	}
	t.Cleanup(r.Stop)
	return r
}

// uniqueKey returns a JobKey that is distinct per-call so independent
// rapid iterations of the same test do not collide on the registry's
// jobsByKey dedup channel.
func uniqueKey(suffix int64) JobKey {
	return JobKey{
		ReportID:        ReportID("road_sweeping_0700"),
		FilterHash:      "0000000000000000000000000000000000000000000000000000000000000000",
		OperationalDate: time.Date(2025, 1, 1, 0, 0, 0, int(suffix%1_000_000_000), time.UTC),
	}
}

// TestAsyncJobStateMachine is Property 12 from the
// master-consolidated-reporting spec — the Async Job State Machine.
//
// Validates: Requirements 11.2, 11.3, 11.4, 11.5
func TestAsyncJobStateMachine(t *testing.T) {

	// ---------------------------------------------------------------------
	// (A) Status sequence: pending → running → done, observed in order.
	// ---------------------------------------------------------------------
	t.Run("StatusSequencePendingRunningDone", func(t *testing.T) {
		rapid.Check(t, func(rt *rapid.T) {
			// runDelay is the spread between "run was entered" and
			// "run returned"; rapid varies it to exercise both the
			// brief and the longer running windows. A 0ms draw is
			// allowed — even then the registry must still emit
			// JobRunning before transitioning to JobDone.
			runDelay := time.Duration(rapid.IntRange(0, 25).Draw(rt, "runDelayMs")) * time.Millisecond
			seq := rapid.Int64().Draw(rt, "seq")

			r := newTestRegistry(t, 0)
			key := uniqueKey(seq)

			started := make(chan struct{}, 1)
			proceed := make(chan struct{})

			payload := Payload{
				Rows:        []map[string]any{{"vehicle": "TN-01-AB-1234"}},
				GeneratedAt: time.Date(2025, 1, 1, 8, 0, 0, 0, time.UTC),
			}

			run := func(ctx context.Context) (Payload, error) {
				started <- struct{}{}
				<-proceed
				time.Sleep(runDelay)
				return payload, nil
			}

			// (1) The snapshot returned by SubmitOrGet is taken
			// before the run-driver goroutine starts, so the
			// initial observable status is pending.
			snap, err := r.SubmitOrGet(context.Background(), key, run)
			if err != nil {
				rt.Fatalf("SubmitOrGet returned error: %v", err)
			}
			if snap.Status != JobPending {
				rt.Fatalf("initial snapshot status = %q, want %q", snap.Status, JobPending)
			}
			if snap.ID == "" {
				rt.Fatalf("initial snapshot has empty ID")
			}
			if !snap.SubmittedAt.After(time.Time{}) {
				rt.Fatalf("initial snapshot SubmittedAt is zero")
			}
			if !snap.StartedAt.IsZero() {
				rt.Fatalf("StartedAt populated before run was entered: %v", snap.StartedAt)
			}

			// (2) Wait for the run goroutine to enter; by the time
			// we Poll the registry should already have flipped the
			// status to running.
			select {
			case <-started:
			case <-time.After(1 * time.Second):
				rt.Fatalf("run function never entered")
			}

			running, ok := pollUntil(t, r, snap.ID, 500*time.Millisecond, func(j *Job) bool {
				return j.Status == JobRunning
			})
			if !ok {
				rt.Fatalf("status never became running; last=%+v", running)
			}
			if running.StartedAt.IsZero() {
				rt.Fatalf("StartedAt zero while status=running")
			}
			if !running.CompletedAt.IsZero() {
				rt.Fatalf("CompletedAt populated while status=running: %v", running.CompletedAt)
			}

			// (3) Release the run; the registry must transition to
			// done and surface the marshalled payload.
			close(proceed)
			done, ok := pollUntil(t, r, snap.ID, 2*time.Second, func(j *Job) bool {
				return j.Status.IsTerminal()
			})
			if !ok {
				rt.Fatalf("status never became terminal; last=%+v", done)
			}
			if done.Status != JobDone {
				rt.Fatalf("terminal status = %q, want %q (errorReason=%q)", done.Status, JobDone, done.ErrorReason)
			}
			if done.CompletedAt.IsZero() {
				rt.Fatalf("CompletedAt zero on done job")
			}
			if done.CompletedAt.Before(done.StartedAt) {
				rt.Fatalf("CompletedAt %v before StartedAt %v", done.CompletedAt, done.StartedAt)
			}
			if len(done.Payload) == 0 {
				rt.Fatalf("done job has empty Payload")
			}
			var got Payload
			if err := json.Unmarshal(done.Payload, &got); err != nil {
				rt.Fatalf("done.Payload is not valid JSON: %v", err)
			}
			if len(got.Rows) != 1 || got.Rows[0]["vehicle"] != "TN-01-AB-1234" {
				rt.Fatalf("done.Payload did not round-trip; got=%+v", got)
			}
		})
	})

	// ---------------------------------------------------------------------
	// (B) Submission latency: SubmitOrGet returns quickly even when run
	// is slow. This is the JobRegistry-side contract that lets the HTTP
	// layer meet Req 11.2's "202 within 1s of crossing the 30s threshold".
	// ---------------------------------------------------------------------
	t.Run("SubmitOrGetReturnsWithinOneSecond", func(t *testing.T) {
		rapid.Check(t, func(rt *rapid.T) {
			seq := rapid.Int64().Draw(rt, "seq")
			r := newTestRegistry(t, 0)
			key := uniqueKey(seq)

			block := make(chan struct{})
			t.Cleanup(func() { close(block) })

			run := func(ctx context.Context) (Payload, error) {
				select {
				case <-block:
					return Payload{}, nil
				case <-ctx.Done():
					return Payload{}, ctx.Err()
				}
			}

			start := time.Now()
			snap, err := r.SubmitOrGet(context.Background(), key, run)
			elapsed := time.Since(start)

			if err != nil {
				rt.Fatalf("SubmitOrGet returned error: %v", err)
			}
			// Req 11.2 budget is 1s; the registry's actual cost is
			// a map lookup plus a goroutine spawn, comfortably
			// inside 100ms even on a loaded CI box.
			if elapsed > 100*time.Millisecond {
				rt.Fatalf("SubmitOrGet took %v, want <100ms", elapsed)
			}
			if len(snap.ID) < 16 || len(snap.ID) > 64 {
				rt.Fatalf("Job.ID length %d outside Req 11.2 bound [16,64]", len(snap.ID))
			}
		})
	})

	// ---------------------------------------------------------------------
	// (C) Concurrent same-key dedup: N submitters share one Job within
	// 200ms and run is invoked exactly once (Req 11.3).
	// ---------------------------------------------------------------------
	t.Run("ConcurrentSameKeyShareSingleJob", func(t *testing.T) {
		rapid.Check(t, func(rt *rapid.T) {
			n := rapid.IntRange(2, 32).Draw(rt, "n")
			seq := rapid.Int64().Draw(rt, "seq")

			r := newTestRegistry(t, 0)
			key := uniqueKey(seq)

			block := make(chan struct{})
			var runInvocations int64
			run := func(ctx context.Context) (Payload, error) {
				atomic.AddInt64(&runInvocations, 1)
				<-block
				return Payload{Rows: []map[string]any{{"x": 1}}}, nil
			}

			// Barrier so all goroutines hit SubmitOrGet as close to
			// simultaneously as the runtime allows; without it the
			// first call would terminally win the dedup race well
			// before the others got scheduled.
			gate := make(chan struct{})
			results := make([]string, n)
			latencies := make([]time.Duration, n)
			errs := make([]error, n)
			var wg sync.WaitGroup
			wg.Add(n)
			for i := 0; i < n; i++ {
				go func(idx int) {
					defer wg.Done()
					<-gate
					start := time.Now()
					snap, err := r.SubmitOrGet(context.Background(), key, run)
					latencies[idx] = time.Since(start)
					if err != nil {
						errs[idx] = err
						return
					}
					results[idx] = snap.ID
				}(i)
			}
			close(gate)
			wg.Wait()

			// Every call must succeed.
			for i, e := range errs {
				if e != nil {
					rt.Fatalf("submitter %d returned error: %v", i, e)
				}
			}

			// All N submitters observe the same Job.ID — singleflight
			// by key collapsed them onto one record.
			first := results[0]
			if first == "" {
				rt.Fatalf("submitter 0 got empty Job.ID")
			}
			for i, id := range results {
				if id != first {
					rt.Fatalf("submitter %d got Job.ID %q, want %q (dedup failed)", i, id, first)
				}
			}

			// Per-call latency is bounded by Req 11.3's 200ms p99.
			for i, d := range latencies {
				if d > 200*time.Millisecond {
					rt.Fatalf("submitter %d latency %v exceeds 200ms (Req 11.3)", i, d)
				}
			}

			// Release run and let it terminate cleanly so the test
			// cleanup does not race with an in-flight goroutine.
			close(block)
			pollUntil(t, r, first, 2*time.Second, func(j *Job) bool {
				return j.Status.IsTerminal()
			})

			// Run was invoked exactly once across all submitters.
			if got := atomic.LoadInt64(&runInvocations); got != 1 {
				rt.Fatalf("run invoked %d times across %d submitters; want exactly 1", got, n)
			}
		})
	})

	// ---------------------------------------------------------------------
	// (D) 15-minute ceiling: run that ignores its deadline drives the
	// job into error with reason "async_ceiling_exceeded" and the run
	// callback's context is cancelled with DeadlineExceeded — the
	// mechanism by which Bounded_Worker_Pool slots get released
	// (Req 11.5). runTimeout is dialled down to 50ms so we don't have
	// to wait 15 actual minutes; the property under test is invariant
	// to the absolute timeout value.
	// ---------------------------------------------------------------------
	t.Run("CeilingTransitionsToErrorAndCancelsContext", func(t *testing.T) {
		r := newTestRegistry(t, 50*time.Millisecond)
		key := uniqueKey(time.Now().UnixNano())

		ctxErrCh := make(chan error, 1)
		runReturned := make(chan struct{})
		run := func(ctx context.Context) (Payload, error) {
			// Block until our context is cancelled; record the
			// cancellation cause so we can assert the registry
			// propagated DeadlineExceeded as expected.
			<-ctx.Done()
			ctxErrCh <- ctx.Err()
			close(runReturned)
			return Payload{}, ctx.Err()
		}

		snap, err := r.SubmitOrGet(context.Background(), key, run)
		if err != nil {
			t.Fatalf("SubmitOrGet returned error: %v", err)
		}

		// The 15-minute ceiling (here 50ms) must drive the job into
		// the error terminal state with the canonical reason.
		errJob, ok := pollUntil(t, r, snap.ID, 2*time.Second, func(j *Job) bool {
			return j.Status == JobError
		})
		if !ok {
			t.Fatalf("job never transitioned to error; last=%+v", errJob)
		}
		if errJob.ErrorReason != "async_ceiling_exceeded" {
			t.Fatalf("ErrorReason = %q, want %q (Req 11.5)", errJob.ErrorReason, "async_ceiling_exceeded")
		}
		if errJob.CompletedAt.IsZero() {
			t.Fatalf("CompletedAt zero on errored job")
		}

		// The run callback's context must have been cancelled —
		// that is the propagation channel by which fanned-out
		// Bounded_Worker_Pool tasks get released. We do not block
		// the test on the run goroutine returning (the registry
		// does not either), but we expect it to return soon.
		select {
		case <-runReturned:
			gotErr := <-ctxErrCh
			if gotErr != context.DeadlineExceeded {
				t.Fatalf("run ctx.Err() = %v, want %v (slot-release mechanism)", gotErr, context.DeadlineExceeded)
			}
		case <-time.After(2 * time.Second):
			t.Fatalf("run callback did not observe ctx cancellation within 2s of ceiling")
		}
	})

	// ---------------------------------------------------------------------
	// (E) Error path: a run that returns a non-nil error transitions the
	// job to error with the error's message as ErrorReason. This is the
	// "or error" leg of the {done | error} terminal in the state machine.
	// ---------------------------------------------------------------------
	t.Run("RunErrorTransitionsToError", func(t *testing.T) {
		r := newTestRegistry(t, 0)
		key := uniqueKey(time.Now().UnixNano())

		boom := errString("recompute_failed: synthetic")
		run := func(ctx context.Context) (Payload, error) {
			return Payload{}, boom
		}

		snap, err := r.SubmitOrGet(context.Background(), key, run)
		if err != nil {
			t.Fatalf("SubmitOrGet returned error: %v", err)
		}

		errJob, ok := pollUntil(t, r, snap.ID, 2*time.Second, func(j *Job) bool {
			return j.Status.IsTerminal()
		})
		if !ok {
			t.Fatalf("job never terminated; last=%+v", errJob)
		}
		if errJob.Status != JobError {
			t.Fatalf("terminal status = %q, want %q", errJob.Status, JobError)
		}
		if errJob.ErrorReason != boom.Error() {
			t.Fatalf("ErrorReason = %q, want %q", errJob.ErrorReason, boom.Error())
		}
	})

	// ---------------------------------------------------------------------
	// (F) Poll latency: Poll must respond within Req 11.4's 500ms upper
	// bound for any valid id, even on a registry that already holds many
	// entries. The implementation is a single map lookup under r.mu so
	// the bound is comfortably met; we sample a few statuses to confirm.
	// ---------------------------------------------------------------------
	t.Run("PollRespondsWithinFiveHundredMs", func(t *testing.T) {
		r := newTestRegistry(t, 0)
		key := uniqueKey(time.Now().UnixNano())

		block := make(chan struct{})
		t.Cleanup(func() {
			select {
			case <-block:
			default:
				close(block)
			}
		})
		run := func(ctx context.Context) (Payload, error) {
			<-block
			return Payload{}, nil
		}

		snap, err := r.SubmitOrGet(context.Background(), key, run)
		if err != nil {
			t.Fatalf("SubmitOrGet returned error: %v", err)
		}

		for i := 0; i < 50; i++ {
			start := time.Now()
			if _, err := r.Poll(context.Background(), snap.ID); err != nil {
				t.Fatalf("Poll returned error: %v", err)
			}
			if d := time.Since(start); d > 500*time.Millisecond {
				t.Fatalf("Poll #%d took %v, exceeds Req 11.4 500ms bound", i, d)
			}
		}
	})
}

// errString is a minimal error type so the error-path test can compare
// ErrorReason byte-for-byte without pulling in fmt.Errorf's prefix.
type errString string

func (e errString) Error() string { return string(e) }
