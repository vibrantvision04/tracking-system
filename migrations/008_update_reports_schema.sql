-- Migration to add Zone, Ward, and StoppagesCount to movement_reports
ALTER TABLE movement_reports ADD COLUMN IF NOT EXISTS zone VARCHAR(255);
ALTER TABLE movement_reports ADD COLUMN IF NOT EXISTS ward VARCHAR(255);
ALTER TABLE movement_reports ADD COLUMN IF NOT EXISTS stoppages_count INTEGER DEFAULT 0;
