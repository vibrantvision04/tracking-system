-- 039 Add is_finalized flag to movement_reports
-- Once a day's report is finalized at midnight, no further GPS/ignition data
-- may overwrite the stored values.
ALTER TABLE movement_reports
    ADD COLUMN IF NOT EXISTS is_finalized BOOLEAN NOT NULL DEFAULT FALSE;

-- Index to speed up "finalize all of yesterday" queries
CREATE INDEX IF NOT EXISTS idx_movement_reports_finalized
    ON movement_reports (report_date, is_finalized);
