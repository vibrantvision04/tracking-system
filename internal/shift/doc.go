// Package shift centralizes the shift-window and operational-date logic that
// the reporting subsystem uses to anchor a piece of data to a reporting day.
//
// Background. Several call sites independently re-derive the same concepts:
// "what calendar day does this clock-time belong to for reporting?" and
// "is now inside the configured shift for this operational date?". The
// duplication is called out in docs/reporting-architecture-redesign.md §6 as
// a source of inconsistency. The currently duplicated implementations live in:
//
//   - internal/service/report_service.go (~L585)
//   - internal/api/report_handlers.go
//   - internal/api/handlers.go
//   - internal/repository/open_depot_repo.go
//
// This package exposes the canonical helpers that every consumer should call
// going forward. The four call sites above are NOT touched by the package
// itself — they migrate to these helpers when their data-source adapters are
// wired in (master-consolidated-reporting tasks 7.2 and 8.x).
//
// Core concepts:
//
//   - Shift is a time-of-day window expressed as two time.Duration offsets
//     from midnight (StartTime, EndTime). Both are time-of-day offsets, not
//     absolute timestamps. A shift whose EndTime is less than or equal to its
//     StartTime crosses midnight (e.g. 18:00 -> next-day 06:00).
//
//   - OperationalDate(now, cutoff) returns the calendar day that "owns" a
//     clock time. The cutoff is the moment-of-day at which the operational
//     day rolls over; clock times earlier in the day than the cutoff are
//     attributed to the previous calendar day. The default cutoff is 4h. A
//     shift that crosses midnight resolves to its start day for every clock
//     time inside the shift, provided the cutoff is at or after the shift's
//     EndTime.
//
//   - ShiftWindow(date, shift) returns the absolute time window that the
//     given Shift covers on the supplied operational date. The returned end
//     is rolled forward by 24h when the shift crosses midnight.
//
//   - IsShiftActive(now, date, shift) reports whether now sits inside the
//     closed interval [start, end] produced by ShiftWindow.
//
// All helpers preserve the time.Location of their inputs. Callers that work
// in IST should pass IST-anchored values (e.g. via utils.CurrentTimeInIndia
// and dates constructed in utils.IndianLocation); helpers in this package
// neither assume nor enforce a particular zone.
//
// This package is the migration target referenced by tasks 7.2 and 8.x of the
// master-consolidated-reporting spec. Existing call sites are not modified by
// this task (1.1); they migrate when their data-source adapters are wired in.
package shift
