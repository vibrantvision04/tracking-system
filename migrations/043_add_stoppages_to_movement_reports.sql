-- 043 Add stoppages column to movement_reports table
ALTER TABLE movement_reports ADD COLUMN IF NOT EXISTS stoppages JSONB DEFAULT '[]'::jsonb;
