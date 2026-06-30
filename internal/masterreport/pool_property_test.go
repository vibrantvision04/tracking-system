package masterreport

import (
	"sync/atomic"
	"testing"
	"time"

	"pgregory.net/rapid"
)

// TestBoundedConcurrencyInvariant is Property 11 from the
// master-consolidated-reporting spec — the Bounded Concurrency Invariant.
//
// For any sequence of work items submitted to a BoundedWorkerPool:
//
//  1. The number of concurrently executing worker goroutines never exceeds
//     MaxConcurrentVehicles (=12) at any instant during the run.
//  2. Submit returns ErrPoolFull once the FIFO backlog has reached MaxBacklog
//     (=1000) unstarted items.
//
// The first invariant is exercised over rapid-generated batches of N ∈ [1,
// 2000] no-op tasks. Each task atomically bumps an in-flight counter, updates
// a CAS-protected peak, sleeps briefly so the scheduler interleaves up to 12
// workers, then decrements the counter. After draining the pool we assert
// peak ≤ MaxConcurrentVehicles.
//
// The second invariant is exercised by submitting blocked workers so the
// dispatcher cannot drain the backlog. After saturating the backlog every
// subsequent Submit must return ErrPoolFull, and the count of successful
// submissions must land within [MaxBacklog, MaxBacklog + MaxConcurrentVehicles
// + 1] — the lower bound is the backlog channel capacity, and the upper bound
// allows the dispatcher to hold one in-flight item plus up to 12 already-
// dispatched workers stuck on the release barrier.
//
// Validates: Requirements 11.1, 11.6
func TestBoundedConcurrencyInvariant(t *testing.T) {
	t.Run("PeakConcurrencyNeverExceedsLimit", func(t *testing.T) {
		rapid.Check(t, func(rt *rapid.T) {
			n := rapid.IntRange(1, 2000).Draw(rt, "n")

			pool := NewBoundedWorkerPool()

			var inFlight int64
			var peak int64

			recordPeak := func(cur int64) {
				for {
					prev := atomic.LoadInt64(&peak)
					if cur <= prev {
						return
					}
					if atomic.CompareAndSwapInt64(&peak, prev, cur) {
						return
					}
				}
			}

			work := func() {
				cur := atomic.AddInt64(&inFlight, 1)
				recordPeak(cur)
				// A brief sleep is enough to let the scheduler fan out up
				// to MaxConcurrentVehicles workers before any of them
				// completes, so the bound is actually exercised. With no
				// sleep the work would flash through and rarely overlap.
				time.Sleep(50 * time.Microsecond)
				atomic.AddInt64(&inFlight, -1)
			}

			submitted := 0
			for i := 0; i < n; i++ {
				err := pool.Submit(work)
				if err == ErrPoolFull {
					// Backlog is momentarily full. Stop submitting — the
					// peak observation over the prefix we did submit is
					// still a valid sample of the invariant.
					break
				}
				if err != nil {
					rt.Fatalf("Submit returned unexpected error at i=%d: %v", i, err)
				}
				submitted++
			}

			pool.Stop()

			if peak > int64(MaxConcurrentVehicles) {
				rt.Fatalf(
					"peak concurrency %d exceeded MaxConcurrentVehicles=%d (n=%d, submitted=%d)",
					peak, MaxConcurrentVehicles, n, submitted,
				)
			}
			if got := atomic.LoadInt64(&inFlight); got != 0 {
				rt.Fatalf("workers still in flight after Wait: inFlight=%d", got)
			}
		})
	})

	t.Run("BacklogOverflowReturnsErrPoolFull", func(t *testing.T) {
		pool := NewBoundedWorkerPool()

		// Every submitted worker blocks on this channel. No slot is ever
		// released, so the dispatcher fills the semaphore (12 in-flight) plus
		// possibly one item it is holding while waiting for a slot, and the
		// backlog channel saturates at MaxBacklog (1000) items.
		release := make(chan struct{})
		blocked := func() { <-release }

		const overshoot = 200
		totalAttempts := MaxBacklog + MaxConcurrentVehicles + overshoot

		var successCount, poolFullCount int
		firstFailureAt := -1
		for i := 0; i < totalAttempts; i++ {
			err := pool.Submit(blocked)
			switch err {
			case nil:
				successCount++
			case ErrPoolFull:
				poolFullCount++
				if firstFailureAt < 0 {
					firstFailureAt = i
				}
			default:
				t.Fatalf("unexpected Submit error at i=%d: %v", i, err)
			}
		}

		// At least one ErrPoolFull must have been observed once total
		// submissions exceeded pool + backlog capacity.
		if poolFullCount == 0 {
			t.Fatalf(
				"expected at least one ErrPoolFull after %d submissions with blocked workers; got %d successes and 0 failures",
				totalAttempts, successCount,
			)
		}

		minAllowed := MaxBacklog
		maxAllowed := MaxBacklog + MaxConcurrentVehicles + 1
		if successCount < minAllowed {
			t.Fatalf(
				"expected at least %d successful submits before ErrPoolFull (the backlog channel capacity); got %d (first failure at i=%d)",
				minAllowed, successCount, firstFailureAt,
			)
		}
		if successCount > maxAllowed {
			t.Fatalf(
				"expected at most %d successful submits before ErrPoolFull (MaxBacklog + MaxConcurrentVehicles + 1); got %d",
				maxAllowed, successCount,
			)
		}

		// Release the blocked workers and drain the pool cleanly. Stop
		// rejects further Submits, drains the queued backlog, and waits
		// for every worker to return.
		close(release)
		pool.Stop()
	})
}
