-- 015_vehicle_purposes.sql
-- Creates a managed vehicle_purposes table (Vehicle Collection Types)

CREATE TABLE IF NOT EXISTS vehicle_purposes (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    is_active  BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default collection types visible in the screenshot
INSERT INTO vehicle_purposes (name, is_active) VALUES
  ('Other',                       true),
  ('Garden Irrigation',           true),
  ('Inert Waste Transportation',  true),
  ('Bulk Collection Spare',       true),
  ('Bulk Collection Wet Waste',   true),
  ('Bulk Collection Dry Waste',   true),
  ('D2D Waste Collection',        true),
  ('Electric Section',            true),
  ('Commercial Collection',       true),
  ('Transfer Station To Landfill',true)
ON CONFLICT (name) DO NOTHING;

SELECT setval('vehicle_purposes_id_seq', (SELECT MAX(id) FROM vehicle_purposes));
