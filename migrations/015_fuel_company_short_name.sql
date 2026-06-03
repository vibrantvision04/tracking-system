-- Add short_name column to fuel_companies
ALTER TABLE fuel_companies ADD COLUMN IF NOT EXISTS short_name TEXT;
