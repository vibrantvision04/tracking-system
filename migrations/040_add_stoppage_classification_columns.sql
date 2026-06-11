-- 040 Add minor_stoppages and major_stoppages columns to movement_reports
ALTER TABLE movement_reports ADD COLUMN IF NOT EXISTS minor_stoppages INTEGER DEFAULT 0;
ALTER TABLE movement_reports ADD COLUMN IF NOT EXISTS major_stoppages INTEGER DEFAULT 0;
