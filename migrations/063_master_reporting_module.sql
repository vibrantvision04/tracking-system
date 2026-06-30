-- 063_master_reporting_module.sql
-- Master Consolidated Reporting (MCR) module: report_output_cache table.
--
-- Permissions for `reports.<id>.{view,export,generate}` plus the base
-- `reports.view` and admin `reports.force_recalculate` rows are seeded at
-- boot from `masterreport.PermissionsForCatalog` via
-- `repository.RBACRepository.RegisterPermissions` (ON CONFLICT DO NOTHING).
-- See task 14.2 in .kiro/specs/master-consolidated-reporting/tasks.md.
-- No permission INSERTs are performed here so that adding/removing a
-- ReportDefinition does not require a new migration.
--
-- Idempotent: re-running this migration is a no-op (CREATE ... IF NOT EXISTS).

BEGIN;

CREATE TABLE IF NOT EXISTS report_output_cache (
    report_id         TEXT NOT NULL,
    filter_hash       CHAR(64) NOT NULL,            -- SHA-256 hex of canonicalized filters
    operational_date  DATE NOT NULL,
    payload           JSONB,                        -- nullable while status='computing'
    input_version     BIGINT NOT NULL DEFAULT 0,
    status            TEXT NOT NULL DEFAULT 'valid'
                      CHECK (status IN ('valid', 'stale', 'computing', 'error')),
    computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    computing_since   TIMESTAMPTZ,
    error_reason      TEXT,
    PRIMARY KEY (report_id, filter_hash, operational_date)
);

-- Eviction cron scans by computed_at to delete rows older than 30 days.
CREATE INDEX IF NOT EXISTS idx_roc_eviction
    ON report_output_cache (computed_at);

-- Invalidation lookups: when an upstream data source signals change, mark
-- every cache row for a given report_id as stale.
CREATE INDEX IF NOT EXISTS idx_roc_report_status
    ON report_output_cache (report_id, status);

-- Partial index for in-flight job discovery and stuck-job recovery.
CREATE INDEX IF NOT EXISTS idx_roc_computing
    ON report_output_cache (status, computing_since)
    WHERE status = 'computing';

COMMIT;
