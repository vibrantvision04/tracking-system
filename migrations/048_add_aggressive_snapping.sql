-- 048: Add aggressive snapping configuration to routes table
ALTER TABLE routes ADD COLUMN IF NOT EXISTS aggressive_snapping BOOLEAN DEFAULT false;
