// Package masterreport contains the Master Consolidated Reporting Module.
//
// This file implements JobRegistry — the in-process async-job tracker that
// powers the >30-second synchronous-execution escape hatch (Req 11.2–11.5,
// 11.7; design §8). When SmartLoader's synchronous recompute crosses the
// 30-second threshold, the HTTP handler hands the remaining work to
// SubmitOrGet and immediately returns HTTP 202 with the resulting Job.ID;
// subsequent polls (GET /api/master-reports/jobs/{id}) call Poll to surface
// the running / done / error status until the entry expires from the
// 24-hour retention window.
//
// Threading model: a single sync.Mutex serialises every mutation on the
// two id/key maps and the LRU list. SubmitOrGet's critical section is
// O(1) — a map lookup plus, at most, one map insert and one list push —
// so the 200ms p99 dedup latency from Req 11.3 is trivially met.
//
// Memory budget: design §19.3 caps the registry at 10,000 jobs. Pending
// and running jobs are never evicted by the cap (they have their own
// 15-minute ceiling); only terminal jobs are dropped under pressure.
//
// Slot release on overrun: the registry does not itself hold a
// BoundedWorkerPool slot — the slot is acquired by the per-vehicle /
// per-zone / per-ward goroutines spawned inside DataSource.Compute. When
// the 15-minute ceiling fires, the context.WithTimeout passed to the
// caller's run function expires; that cancellation propagates into every
// pool-backed worker, each of which releases its semaphore slot in its
// deferred cleanup. The slot release in Req 11.5 is therefore an emergent
// property of context propagation rather than a direct API call.
//
// Requirements covered: 11.2, 11.3, 11.4, 11.5, 11.7.
package masterreport

import (
	"container/list"
	"context"
	"crypto/rand"
	"encoding/base32"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

// -----------------------------------------------------------------------------
// Tunables
// -----------------------------------------------------------------------------

const (
	// JobIDByteLen is the random-byte count used to seed each Job.ID.
	// 20 bytes of base32 (StdEncoding, no padding) encode to exactly
	// 32 characters — design §8.3.
	JobIDByteLen = 20

	// JobIDLen is the resulting Job.ID character length. 32 sits comfortably
	// inside the 16–64 alphanumeric bound in Req 11.2.
	JobIDLen = 32

	// JobMaxAge is the retention window per Req 11.4 and Req 11.7. Polls
	// arriving after this duration since SubmittedAt return ErrJobNotFound,
	// and the cleanup goroutine removes the entry from both maps and the
	// LRU list.
	JobMaxAge = 24 * time.Hour

	// JobMaxRuntime is the hard ceiling per Req 11.2 and Req 11.5. The
	// run-wrapper goroutine cancels its context after this duration and
	// marks the job as error with reason "async_ceiling_exceeded".
	JobMaxRuntime = 15 * time.Minute

	// MaxJobs is the LRU cap (design §19.3). Only terminal jobs are
	// evicted by the cap; pending and running jobs are skipped.
	MaxJobs = 10000

	// cleanupInterval is how often the cleanup goroutine wakes to enforce
	// JobMaxAge and MaxJobs. Five minutes is far below the 24-hour
	// retention window while keeping wakeup cost negligible — a sweep
	// every 5 minutes means a terminal job lingers at most JobMaxAge +
	// 5 min past its eligibility, which is well inside the "expire at
	// roughly +24h" tolerance Req 11.7 allows for.
	cleanupInterval = 5 * time.Minute

	// asyncCeilingExceededReason is the canonical Job.ErrorReason set when
	// runJob's 15-minute deadline fires (Req 11.5).
	asyncCeilingExceededReason = "async_ceiling_exceeded"
)

// -----------------------------------------------------------------------------
// JobStatus
// -----------------------------------------------------------------------------

// JobStatus enumerates the lifecycle states of a Job. The state machine is
// strictly forward:
//
//	pending → running → done | error
//
// No backward transitions occur and no state is skipped (running is set
// even when run() returns before the registry's goroutine schedules).
type JobStatus string

const (
	JobPending JobStatus = "pending"
	JobRunning JobStatus = "running"
	JobDone    JobStatus = "done"
	JobError   JobStatus = "error"
)

// IsTerminal reports whether s is a final state (done or error). The
// cleanup loop uses this to decide LRU eligibility.
func (s JobStatus) IsTerminal() bool {
	return s == JobDone || s == JobError
}

// -----------------------------------------------------------------------------
// JobKey
// -----------------------------------------------------------------------------

// JobKey is the composite identity of a unit of async work — one tuple per
// (report, filter set, operational date) combination. Two requests with the
// same JobKey describe the same computation and must collapse onto a single
// in-flight Job (Req 11.3, design §8.5).
//
// The components match the report_output_cache primary key:
//
//   - ReportID         — the catalog ID being computed.
//   - FilterHash       — the 64-char SHA-256 hex digest produced by
//     FilterHash over the canonicalised FilterPayload (Req 2.6).
//   - OperationalDate  — the shift-anchored reporting day resolved through
//     shift.OperationalDate (Req 12.3). Only the year-month-day portion is
//     significant; sub-day components are dropped when stringified.
type JobKey struct {
	ReportID        ReportID
	FilterHash      string
	OperationalDate time.Time
}

// String returns the canonical "report_id|filter_hash|operational_date" form
// used as the jobsByKey map key. OperationalDate is rendered as ISO
// `YYYY-MM-DD` so identical operational days produce byte-identical keys
// regardless of the time component or location attached to the time.Time.
//
// Implements fmt.Stringer so log statements and audit metadata can interpolate
// a JobKey directly.
func (k JobKey) String() string {
	return string(k.ReportID) + "|" + k.FilterHash + "|" + k.OperationalDate.UTC().Format("2006-01-02")
}

// -----------------------------------------------------------------------------
// Sentinel errors
// -----------------------------------------------------------------------------

// ErrJobNotFound is returned by Poll when the job ID is unknown or older
// than JobMaxAge since SubmittedAt. The HTTP layer maps this to a 404 with
// error.code = "job_not_found" per design §16.
var ErrJobNotFound = errors.New("masterreport: job not found")

// errNilRunFunc is returned by SubmitOrGet when run is nil. Kept separate
// from ErrJobNotFound so callers can distinguish caller-side misuse from
// retention expiry.
var errNilRunFunc = errors.New("masterreport: nil run func submitted to job registry")

// -----------------------------------------------------------------------------
// Job
// -----------------------------------------------------------------------------

// Job is the in-memory record of one async report computation. Fields are
// mutated only under JobRegistry.mu; callers receive a snapshot copy from
// SubmitOrGet and Poll so they may read fields without synchronisation.
//
// Time fields default to the zero value until their transition fires:
//
//   - SubmittedAt — set on creation (always populated).
//   - StartedAt   — set when status transitions to running.
//   - CompletedAt — set when status transitions to done or error.
//
// Payload is JSON-encoded once, on success, and never mutated afterward.
// ErrorReason is the canonical short string the HTTP layer surfaces to
// the client; on async-ceiling overruns it is exactly "async_ceiling_exceeded".
type Job struct {
	ID          string
	Key         JobKey
	Status      JobStatus
	SubmittedAt time.Time
	StartedAt   time.Time
	CompletedAt time.Time
	Payload     json.RawMessage
	ErrorReason string
}

// jobEntry is the registry-internal wrapper that ties a Job to its LRU
// list element so removal is O(1).
type jobEntry struct {
	job  *Job
	elem *list.Element // points into JobRegistry.lru; Value == this *jobEntry
}

// -----------------------------------------------------------------------------
// JobRegistry
// -----------------------------------------------------------------------------

// JobRegistry is the in-process tracker for async report jobs. One instance
// is constructed in masterreport.New and shared across every HTTP handler
// that may need to escape the 30-second synchronous threshold.
//
// The registry intentionally has no persistence: design §8.1 keeps job IDs
// transient (the eventual payload is durable through report_output_cache),
// and the 24-hour retention window plus 15-minute ceiling guarantee every
// record fits comfortably inside one process uptime.
type JobRegistry struct {
	mu        sync.Mutex
	jobs      map[string]*jobEntry // id  → entry
	jobsByKey map[string]*jobEntry // key → entry (dedup channel for Req 11.3)
	lru       *list.List           // most-recently-used at Front; values are *jobEntry

	ctx    context.Context    // lifecycle context for the cleanup goroutine
	cancel context.CancelFunc // halts the cleanup goroutine on Stop

	// Hooks below are overridable from tests; production callers use the
	// values set by NewJobRegistry.
	now        func() time.Time
	runTimeout time.Duration
	maxAge     time.Duration
	maxJobs    int
}

// NewJobRegistry constructs a JobRegistry and starts its cleanup goroutine.
// The supplied ctx scopes the cleanup loop only; per-job timeouts derive
// from r.runTimeout (default JobMaxRuntime) and are independent of ctx so
// in-flight work continues even if the parent context cancels mid-tick.
// Callers that want a hard process-shutdown of in-flight jobs should call
// Stop, which cancels the registry-internal context propagated into every
// run wrapper.
func NewJobRegistry(ctx context.Context) *JobRegistry {
	c, cancel := context.WithCancel(ctx)
	r := &JobRegistry{
		jobs:       make(map[string]*jobEntry),
		jobsByKey:  make(map[string]*jobEntry),
		lru:        list.New(),
		ctx:        c,
		cancel:     cancel,
		now:        time.Now,
		runTimeout: JobMaxRuntime,
		maxAge:     JobMaxAge,
		maxJobs:    MaxJobs,
	}
	go r.cleanupLoop()
	return r
}

// Stop halts the cleanup goroutine and signals every in-flight run wrapper
// via context cancellation. The slot release described in Req 11.5 is the
// downstream effect: cancelled run() returns, its BoundedWorkerPool tasks
// honor ctx, and each worker's deferred sem release frees its slot.
//
// Stop is idempotent; repeated calls are safe.
func (r *JobRegistry) Stop() { r.cancel() }

// -----------------------------------------------------------------------------
// SubmitOrGet
// -----------------------------------------------------------------------------

// SubmitOrGet returns the existing pending-or-running Job whose Key matches
// key, or — when no such entry exists — registers a fresh Job, spawns its
// driver goroutine, and returns the new record. The returned *Job is a
// snapshot copy: the caller may read its fields without holding r.mu and
// the registry's later mutations do not affect it.
//
// The run callback receives a context that is cancelled once JobMaxRuntime
// has elapsed (Req 11.5). Implementations must honor ctx so that fanned-out
// BoundedWorkerPool tasks return promptly when the ceiling fires.
//
// Determinism: when an entry already exists with status pending or running,
// the function takes the same code path regardless of clock drift, so the
// 200ms p99 latency in Req 11.3 is bounded by the cost of a map lookup.
// When the existing entry is terminal (done / error) its key dedup slot is
// reclaimed by the new job; the terminal entry remains pollable by ID for
// the remainder of its 24-hour retention window.
func (r *JobRegistry) SubmitOrGet(ctx context.Context, key JobKey, run func(context.Context) (Payload, error)) (*Job, error) {
	if run == nil {
		return nil, errNilRunFunc
	}

	keyStr := key.String()

	r.mu.Lock()
	if e, ok := r.jobsByKey[keyStr]; ok {
		if !e.job.Status.IsTerminal() {
			// Singleflight hit: bump the LRU position and return a snapshot.
			r.lru.MoveToFront(e.elem)
			snap := *e.job
			r.mu.Unlock()
			return &snap, nil
		}
		// Terminal entry occupies the dedup slot. We fall through and
		// register a new job below; the assignment to jobsByKey overwrites
		// the stale mapping, but r.jobs still holds the old entry so polls
		// against its ID continue to succeed until retention expires.
	}

	id, err := generateJobID()
	if err != nil {
		r.mu.Unlock()
		return nil, fmt.Errorf("masterreport: job id: %w", err)
	}
	j := &Job{
		ID:          id,
		Key:         key,
		Status:      JobPending,
		SubmittedAt: r.now(),
	}
	e := &jobEntry{job: j}
	e.elem = r.lru.PushFront(e)
	r.jobs[id] = e
	r.jobsByKey[keyStr] = e
	r.enforceCapLocked()
	snap := *j
	r.mu.Unlock()

	go r.runJob(j, run)
	return &snap, nil
}

// -----------------------------------------------------------------------------
// Poll
// -----------------------------------------------------------------------------

// Poll returns a snapshot of the Job identified by id. The returned *Job is
// a value copy: the caller owns it and may read freely without holding the
// registry lock.
//
// Poll returns ErrJobNotFound when:
//
//   - the id has never been issued, or
//   - the id was issued more than JobMaxAge ago (Req 11.7).
//
// Per Req 11.4 the function is wait-free on the happy path — a single map
// lookup plus a clock read — well inside the 500ms upper bound.
func (r *JobRegistry) Poll(ctx context.Context, id string) (*Job, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	e, ok := r.jobs[id]
	if !ok {
		return nil, ErrJobNotFound
	}
	if r.now().Sub(e.job.SubmittedAt) > r.maxAge {
		// Expired by retention: surface 404 now; the cleanup goroutine
		// will reclaim the slot on its next tick.
		return nil, ErrJobNotFound
	}
	r.lru.MoveToFront(e.elem)
	snap := *e.job
	return &snap, nil
}

// -----------------------------------------------------------------------------
// runJob — the per-job driver goroutine
// -----------------------------------------------------------------------------

// runJob is the per-job driver. It transitions the job through pending →
// running → (done | error), enforcing the 15-minute hard ceiling along the
// way. It is invoked by SubmitOrGet exactly once per new Job; runJob never
// outlives JobMaxRuntime even when the inner run goroutine ignores its
// context (the registry returns control to its caller after the timeout
// regardless of whether run has actually returned).
//
// Slot-release contract: when the deadline fires we mark the job as error
// and return. We deliberately do not block waiting for run() to finish.
// The run callback's context is cancelled, propagating into the
// BoundedWorkerPool tasks it spawned; each task's deferred sem release
// frees its slot. The misbehaving run() goroutine that ignores ctx will
// eventually return on its own, at which point its result is dropped (the
// complete/fail helpers below are no-ops once the job is terminal).
func (r *JobRegistry) runJob(j *Job, run func(context.Context) (Payload, error)) {
	runCtx, cancel := context.WithTimeout(r.ctx, r.runTimeout)
	defer cancel()

	r.mu.Lock()
	j.Status = JobRunning
	j.StartedAt = r.now()
	r.mu.Unlock()

	type result struct {
		payload Payload
		err     error
	}
	done := make(chan result, 1)
	go func() {
		p, err := run(runCtx)
		done <- result{p, err}
	}()

	select {
	case res := <-done:
		r.complete(j, res.payload, res.err)
	case <-runCtx.Done():
		var reason string
		if errors.Is(runCtx.Err(), context.DeadlineExceeded) {
			reason = asyncCeilingExceededReason
		} else {
			// Parent registry context cancelled (process shutdown).
			reason = runCtx.Err().Error()
		}
		r.fail(j, reason)
	}
}

// complete records a successful or run-side-failed termination. It is a
// no-op when the job has already been moved to a terminal state — that
// guards against a late return from a run() goroutine whose context was
// cancelled by the 15-minute timeout.
func (r *JobRegistry) complete(j *Job, p Payload, runErr error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if j.Status.IsTerminal() {
		return
	}
	j.CompletedAt = r.now()
	if runErr != nil {
		j.Status = JobError
		j.ErrorReason = runErr.Error()
		return
	}
	b, err := json.Marshal(p)
	if err != nil {
		j.Status = JobError
		j.ErrorReason = "payload_encode: " + err.Error()
		return
	}
	j.Status = JobDone
	j.Payload = b
}

// fail records a ceiling-or-cancellation termination with the given reason.
// Like complete, it is a no-op when the job is already terminal.
func (r *JobRegistry) fail(j *Job, reason string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if j.Status.IsTerminal() {
		return
	}
	j.CompletedAt = r.now()
	j.Status = JobError
	j.ErrorReason = reason
}

// -----------------------------------------------------------------------------
// Cleanup
// -----------------------------------------------------------------------------

// cleanupLoop wakes every cleanupInterval to enforce JobMaxAge retention
// and the MaxJobs LRU cap. It exits cleanly when r.ctx is cancelled (Stop
// or upstream process shutdown).
func (r *JobRegistry) cleanupLoop() {
	t := time.NewTicker(cleanupInterval)
	defer t.Stop()
	for {
		select {
		case <-r.ctx.Done():
			return
		case <-t.C:
			r.sweep()
		}
	}
}

// sweep is one cleanup tick: drop every terminal job older than maxAge,
// then enforce the LRU cap.
func (r *JobRegistry) sweep() {
	r.mu.Lock()
	defer r.mu.Unlock()
	cutoff := r.now().Add(-r.maxAge)

	// Walk from the back (oldest) toward the front (newest). We can break
	// as soon as we hit a terminal job newer than cutoff because list
	// order is insertion-time monotonic from back to front for any entries
	// not bumped by Poll — and Poll bumps only mean older entries appear
	// near the back, never the reverse. Non-terminal entries are skipped
	// (their age is governed by the 15-minute ceiling, not retention).
	for e := r.lru.Back(); e != nil; {
		prev := e.Prev()
		ent := e.Value.(*jobEntry)
		if ent.job.Status.IsTerminal() && ent.job.SubmittedAt.Before(cutoff) {
			r.removeLocked(ent)
		}
		e = prev
	}

	r.enforceCapLocked()
}

// enforceCapLocked evicts terminal entries from the LRU tail until the
// total list length is at or below maxJobs. Non-terminal entries are
// skipped: a pending or running job is never reclaimed by the cap because
// dropping its tracking record would lose the result of work in progress.
//
// Caller must hold r.mu.
func (r *JobRegistry) enforceCapLocked() {
	if r.lru.Len() <= r.maxJobs {
		return
	}
	// Iterate from the back; for each over-cap step, find the oldest
	// terminal entry and remove it. If no terminal entries remain we stop
	// (every slot is occupied by in-flight work — that's by design at
	// most a transient condition since each job has a 15-minute ceiling).
	for r.lru.Len() > r.maxJobs {
		victim := r.oldestTerminalLocked()
		if victim == nil {
			return
		}
		r.removeLocked(victim)
	}
}

// oldestTerminalLocked returns the LRU tail-most jobEntry whose status is
// terminal, or nil when every entry is pending or running.
//
// Caller must hold r.mu.
func (r *JobRegistry) oldestTerminalLocked() *jobEntry {
	for e := r.lru.Back(); e != nil; e = e.Prev() {
		ent := e.Value.(*jobEntry)
		if ent.job.Status.IsTerminal() {
			return ent
		}
	}
	return nil
}

// removeLocked deletes ent from the LRU list, the id map, and (if it still
// owns the key dedup slot) the key map. Re-issuing the same key between
// terminal-set and eviction would have overwritten jobsByKey, so we only
// remove the binding when it still points at us.
//
// Caller must hold r.mu.
func (r *JobRegistry) removeLocked(ent *jobEntry) {
	r.lru.Remove(ent.elem)
	delete(r.jobs, ent.job.ID)
	keyStr := ent.job.Key.String()
	if existing, ok := r.jobsByKey[keyStr]; ok && existing == ent {
		delete(r.jobsByKey, keyStr)
	}
}

// -----------------------------------------------------------------------------
// Job ID generation
// -----------------------------------------------------------------------------

// generateJobID produces a 32-character lowercase base32 token from 20
// random bytes (design §8.3). 20 bytes is exactly the right length so the
// no-padding StdEncoding yields 32 chars with no '=' filler; lowercasing
// keeps the visible alphabet inside [a-z2-7] which is a strict subset of
// the [a-z0-9] bound named in Req 11.2.
func generateJobID() (string, error) {
	var b [JobIDByteLen]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	s := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b[:])
	return strings.ToLower(s), nil
}
