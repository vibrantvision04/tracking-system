// Package masterreport contains the Master Consolidated Reporting Module.
//
// This file implements OutputCacheRepo — the data-access layer that wraps
// the report_output_cache table created by migrations/063_master_reporting_module.sql.
//
// The repo is the single source of truth for cache row state transitions:
//
//	Get                — read the full row for a (report_id, filter_hash,
//	                     operational_date) key including status, computed_at,
//	                     computing_since, payload, error_reason. Returns
//	                     (nil, nil) on absent rows (no error).
//	UpsertComputing    — mark a key as in-flight; stamps computing_since.
//	UpsertValid        — write a fresh payload and clear error_reason; this
//	                     is the success path for SmartLoader and
//	                     ForceRecalculator.
//	RestorePriorStatus — roll a key back to the pre-recompute status on
//	                     compute failure without overwriting payload
//	                     (Req 6.7, 7.6, 12.7).
//	MarkStale          — bulk-invalidate every row for a given report_id
//	                     when an upstream data source signals change
//	                     (Req 12.2).
//	EvictOlderThan     — daily-cron hook that prunes rows by computed_at
//	                     (Req 12.6).
//
// Requirements covered: 6.1, 6.2, 6.3, 6.5, 12.1, 12.2, 12.5, 12.6.
package masterreport

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// -----------------------------------------------------------------------------
// Cache row status constants
// -----------------------------------------------------------------------------

// CacheStatus is the closed enumeration written to report_output_cache.status.
// The DB has a matching CHECK constraint; these constants are the canonical
// Go-side names.
type CacheStatus string

const (
	CacheStatusValid     CacheStatus = "valid"
	CacheStatusStale     CacheStatus = "stale"
	CacheStatusComputing CacheStatus = "computing"
	CacheStatusError     CacheStatus = "error"
)

// IsValid reports whether s is one of the four declared CacheStatus values.
func (s CacheStatus) IsValid() bool {
	switch s {
	case CacheStatusValid, CacheStatusStale, CacheStatusComputing, CacheStatusError:
		return true
	}
	return false
}

// -----------------------------------------------------------------------------
// CacheKey and CacheRow
// -----------------------------------------------------------------------------

// CacheKey is the composite primary key of report_output_cache. SmartLoader,
// ForceRecalculator, and JobRegistry all key on this triple (Req 6.1, 12.1).
//
// OperationalDate is normalised to UTC midnight before being used as the
// DB-level DATE column value (see normalizeDate). Callers may pass any
// time.Time; only the day part matters.
type CacheKey struct {
	ReportID        ReportID
	FilterHash      string
	OperationalDate time.Time
}

// CacheRow is the in-memory representation of one report_output_cache row.
// Every column from the migration is present so callers can implement the
// TTL / staleness rules in §4.1 of the design without a follow-up query.
//
// Payload is nullable in the DB (status='computing' rows do not yet have a
// payload); the Go-side representation uses a pointer so a nil Payload
// distinguishes "not yet computed" from "computed but empty".
//
// ComputingSince is also nullable; non-computing rows leave it unset.
type CacheRow struct {
	Key            CacheKey
	Payload        *Payload
	InputVersion   int64
	Status         CacheStatus
	ComputedAt     time.Time
	ComputingSince *time.Time
	ErrorReason    string
}

// -----------------------------------------------------------------------------
// Repository
// -----------------------------------------------------------------------------

// OutputCacheRepo wraps the report_output_cache table. A single instance is
// constructed at module boot and shared across SmartLoader, ForceRecalculator,
// the data-source invalidation hooks, and the daily eviction cron.
type OutputCacheRepo struct {
	pool *pgxpool.Pool
}

// NewOutputCacheRepo constructs an OutputCacheRepo backed by the supplied
// pgxpool. The pool is the same one used by the rest of the application; no
// dedicated connection pool is required.
func NewOutputCacheRepo(pool *pgxpool.Pool) *OutputCacheRepo {
	return &OutputCacheRepo{pool: pool}
}

// normalizeDate returns t truncated to UTC midnight. The report_output_cache
// operational_date column is DATE, so the time-of-day component is ignored
// by Postgres regardless; doing the truncation here keeps the Go-side
// CacheKey comparable and the round-tripped value stable.
func normalizeDate(t time.Time) time.Time {
	utc := t.UTC()
	return time.Date(utc.Year(), utc.Month(), utc.Day(), 0, 0, 0, 0, time.UTC)
}

// Get reads the full row for the supplied key.
//
// Returns (nil, nil) when no row exists for the key — callers (SmartLoader)
// treat this as the "absent" cache state per Req 6.3. Genuine DB errors are
// returned as the second value.
//
// Validates: Req 6.1, 6.2, 6.3, 6.5, 12.1.
func (r *OutputCacheRepo) Get(ctx context.Context, reportID ReportID, hash string, opDate time.Time) (*CacheRow, error) {
	const query = `
		SELECT report_id, filter_hash, operational_date,
		       payload, input_version, status,
		       computed_at, computing_since, COALESCE(error_reason, '')
		FROM report_output_cache
		WHERE report_id = $1 AND filter_hash = $2 AND operational_date = $3
	`

	var (
		row            CacheRow
		reportIDStr    string
		payloadRaw     []byte
		statusStr      string
		computingSince *time.Time
	)

	err := r.pool.QueryRow(ctx, query, string(reportID), hash, normalizeDate(opDate)).Scan(
		&reportIDStr,
		&row.Key.FilterHash,
		&row.Key.OperationalDate,
		&payloadRaw,
		&row.InputVersion,
		&statusStr,
		&row.ComputedAt,
		&computingSince,
		&row.ErrorReason,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("output_cache get: %w", err)
	}

	row.Key.ReportID = ReportID(reportIDStr)
	row.Status = CacheStatus(statusStr)
	row.ComputingSince = computingSince

	if len(payloadRaw) > 0 {
		var p Payload
		if err := json.Unmarshal(payloadRaw, &p); err != nil {
			return nil, fmt.Errorf("output_cache get: decode payload: %w", err)
		}
		row.Payload = &p
	}

	return &row, nil
}

// UpsertComputing marks the key as in-flight: status='computing' and
// computing_since stamped to the supplied moment. Inserts a fresh row when
// none exists, or updates an existing row in place; the payload is left
// untouched so concurrent SmartLoad polls can still observe the prior
// payload while the recompute runs.
//
// Validates: Req 6.3, 6.5, 6.6, 12.1.
func (r *OutputCacheRepo) UpsertComputing(ctx context.Context, key CacheKey, computingSince time.Time) error {
	const query = `
		INSERT INTO report_output_cache (
			report_id, filter_hash, operational_date,
			payload, input_version, status, computed_at, computing_since, error_reason
		) VALUES (
			$1, $2, $3,
			NULL, 0, 'computing', $4, $4, NULL
		)
		ON CONFLICT (report_id, filter_hash, operational_date) DO UPDATE SET
			status          = 'computing',
			computing_since = EXCLUDED.computing_since
	`
	if _, err := r.pool.Exec(ctx, query,
		string(key.ReportID), key.FilterHash, normalizeDate(key.OperationalDate),
		computingSince.UTC(),
	); err != nil {
		return fmt.Errorf("output_cache upsert_computing: %w", err)
	}
	return nil
}

// UpsertValid writes the recomputed payload for the key and flips status to
// 'valid'. Overwrites prior payload and input_version, clears error_reason
// and computing_since. This is the success path for both SmartLoader and
// ForceRecalculator.
//
// Validates: Req 6.3, 7.3, 7.7, 12.1.
func (r *OutputCacheRepo) UpsertValid(ctx context.Context, key CacheKey, payload Payload, inputVersion int64, computedAt time.Time) error {
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("output_cache upsert_valid: encode payload: %w", err)
	}

	const query = `
		INSERT INTO report_output_cache (
			report_id, filter_hash, operational_date,
			payload, input_version, status, computed_at, computing_since, error_reason
		) VALUES (
			$1, $2, $3,
			$4, $5, 'valid', $6, NULL, NULL
		)
		ON CONFLICT (report_id, filter_hash, operational_date) DO UPDATE SET
			payload         = EXCLUDED.payload,
			input_version   = EXCLUDED.input_version,
			status          = 'valid',
			computed_at     = EXCLUDED.computed_at,
			computing_since = NULL,
			error_reason    = NULL
	`
	if _, err := r.pool.Exec(ctx, query,
		string(key.ReportID), key.FilterHash, normalizeDate(key.OperationalDate),
		payloadBytes, inputVersion, computedAt.UTC(),
	); err != nil {
		return fmt.Errorf("output_cache upsert_valid: %w", err)
	}
	return nil
}

// RestorePriorStatus rolls a row back to the supplied prior status when a
// recompute fails. The payload is left untouched so the prior value remains
// available to subsequent SmartLoad calls (Req 6.7, 7.6, 12.7).
// computing_since is cleared because the in-flight attempt has ended.
//
// When no row exists for the key, the call is a no-op — SmartLoader only
// invokes RestorePriorStatus after a successful UpsertComputing, so the row
// should always exist; the defensive no-op keeps the contract simple.
//
// Validates: Req 6.7, 7.6, 12.7.
func (r *OutputCacheRepo) RestorePriorStatus(ctx context.Context, key CacheKey, priorStatus CacheStatus) error {
	if !priorStatus.IsValid() {
		return fmt.Errorf("output_cache restore_prior_status: invalid prior status %q", string(priorStatus))
	}

	const query = `
		UPDATE report_output_cache
		SET status          = $4,
		    computing_since = NULL
		WHERE report_id = $1 AND filter_hash = $2 AND operational_date = $3
	`
	if _, err := r.pool.Exec(ctx, query,
		string(key.ReportID), key.FilterHash, normalizeDate(key.OperationalDate),
		string(priorStatus),
	); err != nil {
		return fmt.Errorf("output_cache restore_prior_status: %w", err)
	}
	return nil
}

// MarkStale flips every row for the given report_id to status='stale'.
// Called from data-source invalidation hooks when an upstream signal
// indicates that the source data has changed (Req 12.2). The next SmartLoad
// for any affected key will recompute.
//
// Only rows currently in {valid, error} are touched. Rows already in
// {stale, computing} are left as-is: stale is already the target state, and
// computing rows have an in-flight recompute that will land its own status.
//
// Validates: Req 12.2, 12.5.
func (r *OutputCacheRepo) MarkStale(ctx context.Context, reportID ReportID) error {
	const query = `
		UPDATE report_output_cache
		SET status = 'stale'
		WHERE report_id = $1 AND status IN ('valid', 'error')
	`
	if _, err := r.pool.Exec(ctx, query, string(reportID)); err != nil {
		return fmt.Errorf("output_cache mark_stale: %w", err)
	}
	return nil
}

// EvictOlderThan deletes every row whose computed_at is strictly older than
// the supplied cutoff. Returns the count of rows removed. Called by the
// daily eviction cron (Req 12.6); cron registration is wired separately and
// is out of scope for this repo.
//
// Validates: Req 12.6.
func (r *OutputCacheRepo) EvictOlderThan(ctx context.Context, cutoff time.Time) (int, error) {
	const query = `
		DELETE FROM report_output_cache
		WHERE computed_at < $1
	`
	tag, err := r.pool.Exec(ctx, query, cutoff.UTC())
	if err != nil {
		return 0, fmt.Errorf("output_cache evict_older_than: %w", err)
	}
	return int(tag.RowsAffected()), nil
}
