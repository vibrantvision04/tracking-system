-- Migration 037: Open Depot Cleaning Extensions

-- Add summary columns to open_depots
ALTER TABLE open_depots ADD COLUMN IF NOT EXISTS total_submissions INT DEFAULT 0;
ALTER TABLE open_depots ADD COLUMN IF NOT EXISTS total_approved INT DEFAULT 0;
ALTER TABLE open_depots ADD COLUMN IF NOT EXISTS total_rejected INT DEFAULT 0;
ALTER TABLE open_depots ADD COLUMN IF NOT EXISTS last_cleaning_status TEXT;

-- Add distance and timestamp fields to open_depot_cleanings
ALTER TABLE open_depot_cleanings ADD COLUMN IF NOT EXISTS distance_from_depot DOUBLE PRECISION;
ALTER TABLE open_depot_cleanings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE open_depot_cleanings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
