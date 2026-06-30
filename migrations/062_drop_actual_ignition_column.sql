-- 062 Drop actual_ignition_on_duration column from movement_reports
ALTER TABLE movement_reports DROP COLUMN IF EXISTS actual_ignition_on_duration;
