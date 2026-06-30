package shift

import (
	"testing"
	"time"

	"pgregory.net/rapid"
)

// TestOperationalDateAnchoring is Property 12 from the
// master-consolidated-reporting spec. For every Shift whose end-of-day
// offset is strictly earlier than its start-of-day offset (the shift
// crosses midnight), every clock time inside the shift's absolute window
// resolves to the same Operational_Date — namely the shift's start day.
//
// Concretely, given a midnight-crossing shift [S, E_next_day) anchored on
// calendar day D, and a cutoff in the closed interval [E, S], the
// invariants are:
//
//  1. OperationalDate(now, cutoff) == D for every now in
//     [D+S, D+24h+E).
//  2. Two arbitrary clock times in the same shift window resolve to the
//     same Operational_Date, so they share the same
//     (report_id, filter_hash, operational_date) Output_Cache key.
//
// Validates: Requirements 12.3
func TestOperationalDateAnchoring(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		// Generate a start day at midnight UTC within roughly ±50 years of
		// the year 2000 — comfortably inside Go's time.Time range and well
		// past any plausible reporting horizon.
		dayOffset := rapid.IntRange(-18250, 18250).Draw(rt, "dayOffset")
		startDay := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC).
			AddDate(0, 0, dayOffset)

		// Generate a midnight-crossing shift with minute-resolution
		// time-of-day offsets: 0 <= EndTime < StartTime < 24h. Strict
		// inequality matches the task description ("EndTime < StartTime").
		startMinutes := rapid.IntRange(1, 24*60-1).Draw(rt, "startMinutes")
		endMinutes := rapid.IntRange(0, startMinutes-1).Draw(rt, "endMinutes")
		sh := Shift{
			StartTime: time.Duration(startMinutes) * time.Minute,
			EndTime:   time.Duration(endMinutes) * time.Minute,
		}
		if !sh.crossesMidnight() {
			rt.Fatalf("generator invariant violated: shift does not cross midnight: %+v", sh)
		}

		// Choose a cutoff that anchors the entire shift window to startDay.
		// Per the design, EndTime <= cutoff <= StartTime is the legal range
		// in which every now inside the shift, once shifted by -cutoff,
		// lands in [startDay, startDay+24h).
		cutoffMinutes := rapid.IntRange(endMinutes, startMinutes).Draw(rt, "cutoffMinutes")
		cutoff := time.Duration(cutoffMinutes) * time.Minute

		shiftStart, shiftEnd := ShiftWindow(startDay, sh)
		windowNanos := shiftEnd.Sub(shiftStart).Nanoseconds()
		if windowNanos <= 0 {
			rt.Fatalf("generated zero-width shift window for shift %+v", sh)
		}

		// Pick two independent clock times inside the half-open shift
		// window [shiftStart, shiftEnd). Both must anchor to startDay and
		// must produce the same Operational_Date.
		offset1 := rapid.Int64Range(0, windowNanos-1).Draw(rt, "offset1")
		offset2 := rapid.Int64Range(0, windowNanos-1).Draw(rt, "offset2")
		now1 := shiftStart.Add(time.Duration(offset1))
		now2 := shiftStart.Add(time.Duration(offset2))

		got1 := OperationalDate(now1, cutoff)
		if !got1.Equal(startDay) {
			rt.Fatalf(
				"OperationalDate(now=%s, cutoff=%s) = %s, want %s (shift=%+v)",
				now1.Format(time.RFC3339Nano), cutoff,
				got1.Format(time.RFC3339Nano),
				startDay.Format(time.RFC3339Nano), sh,
			)
		}

		got2 := OperationalDate(now2, cutoff)
		if !got2.Equal(got1) {
			rt.Fatalf(
				"cache-key invariance violated: now1=%s -> %s; now2=%s -> %s (shift=%+v, cutoff=%s)",
				now1.Format(time.RFC3339Nano), got1.Format(time.RFC3339Nano),
				now2.Format(time.RFC3339Nano), got2.Format(time.RFC3339Nano),
				sh, cutoff,
			)
		}
	})
}
