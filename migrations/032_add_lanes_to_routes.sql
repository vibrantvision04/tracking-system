-- 032 Add lanes to routes table
ALTER TABLE routes ADD COLUMN IF NOT EXISTS lanes JSONB DEFAULT '[]'::jsonb;
