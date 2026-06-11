-- ============================================================
-- 025: Seed Operational Data for Jaipur VSWM D2D Dashboard
-- ============================================================

-- Ensure zone_id and ward_id columns exist on vehicles table
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS zone_id INT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ward_id INT;

-- Ensure shift_id column exists on routes table
ALTER TABLE routes ADD COLUMN IF NOT EXISTS shift_id INT;

