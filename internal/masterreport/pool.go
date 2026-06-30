// Package masterreport contains the Master Consolidated Reporting Module.
//
// This file implements the shared BoundedWorkerPool used by every
// DataSource.Compute fan-out (per-vehicle, per-zone, per-ward). A single
// pool instance is constructed in masterreport.New and injected into every
// report, keeping the global concurrency cap stable across overlapping
// requests.
//
// The semaphore pattern mirrors the one already in use inside
// internal/api/report_handlers.go::GetD2DRouteCoverageReport
// (`const maxConcurrentVehicles = 12`). Reusing the same cap here means
// request 2 cannot launch its own 12-worker pool while request 1 is already
// saturating the DB pool — every Master Report fan-out shares this single
// 12-slot budget.
//
// Requirements covered: 11.1 (bounded concurrency = 12), 11.6 (backlog cap =
// 1000, returns ErrPoolFull when full).
package masterreport

import (
	"errors"
	"sync"
)

// MaxConcurrentVehicles is the upper bound on goroutines executing work
// through a BoundedWorkerPool at any instant. It matches the value already
// hard-coded in GetD2DRouteCoverageReport (`maxConcurrentVehicles = 12`,
// internal/api/report_handlers.go ~L206) so the global cap stays at 12 no
// matter which subsystem is fanning out.
const MaxConcurrentVehicles = 12

// MaxBacklog is the FIFO capacity of unstarted work items. Submit returns
// ErrPoolFull once the backlog reaches this size (Req 11.6).
const MaxBacklog = 1000

// ErrPoolFull is returned by Submit when the backlog has reached MaxBacklog
// unstarted items, or when Submit is called after Stop. Callers (typically
// the HTTP layer) map this to a 429 pool_overload response per design §4.
var ErrPoolFull = errors.New("masterreport: worker pool backlog full")

// errNilWork is returned by Submit when work is nil. Kept separate from
// ErrPoolFull so callers can distinguish misuse from overload, though both
// failures share the "task was not enqueued" outcome.
var errNilWork = errors.New("masterreport: nil work submitted to bounded worker pool")

// BoundedWorkerPool fans work items out across at most MaxConcurrentVehicles
// goroutines while queueing up to MaxBacklog additional items in FIFO order.
//
// Lifecycle:
//
//	p := NewBoundedWorkerPool()
//	defer p.Stop()
//	_ = p.Submit(func() { /* per-vehicle work */ })
//	p.Wait() // wait for all submitted work to drain
//
// The pool is safe for concurrent use by many submitters.
type BoundedWorkerPool struct {
	// sem caps the number of in-flight worker goroutines. Capacity is
	// MaxConcurrentVehicles. Acquiring a slot is a blocking send; releasing
	// is a receive in the worker's deferred cleanup.
	sem chan struct{}

	// backlog is the FIFO queue of pending work items. Capacity is
	// MaxBacklog. Submit performs a non-blocking send so a full backlog
	// yields ErrPoolFull instead of stalling the caller.
	backlog chan func()

	// wg tracks every successfully-submitted work item until it finishes
	// executing. Wait blocks until this counter reaches zero. The counter
	// is incremented under stopMu so Stop can observe the final count
	// before closing backlog.
	wg sync.WaitGroup

	// stopMu serialises Submit against Stop. Submit holds it as a reader
	// while reserving a wg slot and sending onto backlog; Stop holds it
	// as a writer while flipping `stopped` and closing the channel. This
	// makes "Submit after Stop" return ErrPoolFull instead of panicking
	// on a send to a closed channel.
	stopMu  sync.RWMutex
	stopped bool

	// stopOnce guards Stop so repeated calls are safe and idempotent.
	stopOnce sync.Once
}

// NewBoundedWorkerPool constructs a pool and starts its single dispatcher
// goroutine. The dispatcher pulls work from backlog, acquires a sem slot
// (blocking if 12 workers are already running), then launches the actual
// worker goroutine which releases the slot on completion.
func NewBoundedWorkerPool() *BoundedWorkerPool {
	p := &BoundedWorkerPool{
		sem:     make(chan struct{}, MaxConcurrentVehicles),
		backlog: make(chan func(), MaxBacklog),
	}
	go p.dispatch()
	return p
}

// dispatch is the single goroutine responsible for moving items from backlog
// to sem-gated execution slots. It exits when backlog is closed and drained
// (Stop's contract).
func (p *BoundedWorkerPool) dispatch() {
	for work := range p.backlog {
		// Acquire an execution slot. This blocks when MaxConcurrentVehicles
		// workers are already running, which is exactly the bound we want.
		p.sem <- struct{}{}

		// Spawn the actual worker. It releases the slot and decrements the
		// outstanding-work counter when it returns, even if work panics —
		// otherwise a panicking task would leak a sem permit and the wg
		// counter would never reach zero.
		go func(w func()) {
			defer func() {
				<-p.sem
				p.wg.Done()
			}()
			w()
		}(work)
	}
}

// Submit enqueues work for execution. It returns ErrPoolFull immediately
// (without blocking) when:
//
//   - the backlog already holds MaxBacklog unstarted items, or
//   - the pool has been Stop'd.
//
// A nil work function is rejected with a distinct sentinel so callers can
// distinguish misuse from overload.
//
// The send onto backlog is non-blocking: select { case ...: default: }.
func (p *BoundedWorkerPool) Submit(work func()) error {
	if work == nil {
		return errNilWork
	}

	// Read-lock against Stop. Multiple Submits proceed in parallel; only
	// Stop serialises them by taking the write lock.
	p.stopMu.RLock()
	defer p.stopMu.RUnlock()

	if p.stopped {
		return ErrPoolFull
	}

	// Reserve a slot on the WaitGroup before attempting to enqueue so the
	// dispatcher cannot race ahead of the bookkeeping. If the enqueue
	// fails we undo the reservation.
	p.wg.Add(1)
	select {
	case p.backlog <- work:
		return nil
	default:
		p.wg.Done()
		return ErrPoolFull
	}
}

// Wait blocks until every submitted work item has finished executing. It
// does NOT prevent further submissions; callers that want a quiescent pool
// should invoke Stop first and then Wait (Stop already calls Wait
// internally, so a bare `Stop()` is sufficient).
func (p *BoundedWorkerPool) Wait() {
	p.wg.Wait()
}

// Stop gracefully drains the pool and shuts the dispatcher down:
//
//  1. New Submits are rejected with ErrPoolFull from this point on.
//  2. Already-enqueued items are allowed to run to completion.
//  3. The dispatcher exits once backlog is closed and drained.
//  4. Stop blocks until every in-flight worker has returned.
//
// Stop is idempotent — repeated calls are no-ops.
func (p *BoundedWorkerPool) Stop() {
	p.stopOnce.Do(func() {
		// Mark stopped under the write lock so any concurrent Submit
		// either (a) sees stopped=true and returns ErrPoolFull, or
		// (b) completes its backlog send before we close the channel.
		p.stopMu.Lock()
		p.stopped = true
		close(p.backlog)
		p.stopMu.Unlock()

		// Drain remaining work: the dispatcher will pull every queued
		// item into a sem-gated worker, and each worker's deferred
		// p.wg.Done() releases this Wait.
		p.wg.Wait()
	})
}
