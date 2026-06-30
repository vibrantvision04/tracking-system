package shift

import "time"

// DefaultOperationalCutoff is the default cutoff used by OperationalDate when
// no per-report override is supplied. Clock times earlier in the day than the
// cutoff roll back to the previous calendar day, so a 04:00 cutoff means the
// operational day runs from 04:00 of day D to 04:00 of day D+1.
const DefaultOperationalCutoff = 4 * time.Hour

// Shift describes a single time-of-day window. StartTime and EndTime are
// offsets from midnight (time.Duration), not absolute timestamps. A Shift
// whose EndTime is less than or equal to its StartTime crosses midnight; the
// produced absolute window has its end rolled forward by 24h.
type Shift struct {
	// StartTime is the time-of-day offset (from local midnight) at which the
	// shift begins.
	StartTime time.Duration

	// EndTime is the time-of-day offset (from local midnight) at which the
	// shift ends. When EndTime <= StartTime the shift is treated as crossing
	// midnight and the absolute end is rolled forward by 24h.
	EndTime time.Duration
}

// crossesMidnight reports whether the shift's end-of-day offset lies on or
// before its start-of-day offset, i.e. the shift carries into the next day.
func (s Shift) crossesMidnight() bool {
	return s.EndTime <= s.StartTime
}

// Duration returns the absolute length of the shift, with midnight-crossing
// shifts rolled forward by 24h.
func (s Shift) Duration() time.Duration {
	if s.crossesMidnight() {
		return (24 * time.Hour) - s.StartTime + s.EndTime
	}
	return s.EndTime - s.StartTime
}

// OperationalDate returns the calendar day, at local midnight in now's
// location, that owns the supplied clock time under the given cutoff.
//
// The cutoff is interpreted as a time-of-day offset from midnight: clock
// times earlier in the day than the cutoff are attributed to the previous
// calendar day. Concretely, OperationalDate(now, cutoff) ==
// truncateToMidnight(now - cutoff). With the DefaultOperationalCutoff of 4h,
// 2024-01-16 03:59 maps to 2024-01-15 and 2024-01-16 04:00 maps to
// 2024-01-16.
//
// A shift whose end_time is earlier in the day than its start_time (crosses
// midnight) resolves to its start day for every clock time inside the shift
// window, provided cutoff >= shift.EndTime. Choosing cutoff = shift.EndTime
// is the typical configuration for reports that anchor on a single shift.
//
// The returned time.Time is at 00:00:00.000000000 in now's location.
func OperationalDate(now time.Time, cutoff time.Duration) time.Time {
	if cutoff < 0 {
		cutoff = 0
	}
	anchored := now.Add(-cutoff)
	return time.Date(
		anchored.Year(), anchored.Month(), anchored.Day(),
		0, 0, 0, 0,
		now.Location(),
	)
}

// ShiftWindow returns the absolute time window covering the shift on the
// supplied operational date. The returned start and end are the inclusive
// endpoints applied by IsShiftActive.
//
// The date argument is truncated to local midnight in its own location
// before the StartTime/EndTime offsets are applied, so callers may pass any
// time on the operational day. When the shift crosses midnight, end is
// rolled forward by 24h. The returned values preserve date.Location().
func ShiftWindow(date time.Time, shift Shift) (start, end time.Time) {
	day := time.Date(
		date.Year(), date.Month(), date.Day(),
		0, 0, 0, 0,
		date.Location(),
	)
	start = day.Add(shift.StartTime)
	end = day.Add(shift.EndTime)
	if shift.crossesMidnight() {
		end = end.Add(24 * time.Hour)
	}
	return start, end
}

// IsShiftActive reports whether now falls inside the closed absolute window
// [start, end] produced by ShiftWindow(date, shift).
//
// A zero-length shift (StartTime == EndTime, non-midnight-crossing) is never
// active.
func IsShiftActive(now, date time.Time, shift Shift) bool {
	if shift.Duration() == 0 {
		return false
	}
	start, end := ShiftWindow(date, shift)
	return !now.Before(start) && !now.After(end)
}
