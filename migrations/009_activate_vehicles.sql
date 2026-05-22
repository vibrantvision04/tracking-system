-- Migration to activate all existing vehicles
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
UPDATE vehicles SET is_active = true WHERE is_active = false;
