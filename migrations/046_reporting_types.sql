-- Migration 046: Reporting Type Driven Shift Architecture Upgrade

-- 1. Create report_types master table
CREATE TABLE IF NOT EXISTS report_types (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT
);

-- Seed default report types
INSERT INTO report_types (id, name, description) VALUES
  (1, 'VEHICLE_MOVEMENT', 'Vehicle movement and route coverage reports'),
  (2, 'OPEN_DEPOT', 'Open Depot cleaning approval reports'),
  (3, 'SPECIAL_OPERATIONS', 'Special operations like Road Cleaning, Animal Rescue, RCV, etc.')
ON CONFLICT (name) DO NOTHING;

-- Reset sequence for report_types
SELECT setval('report_types_id_seq', (SELECT MAX(id) FROM report_types));

-- 2. Add report_type_id to shifts table
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS report_type_id INT REFERENCES report_types(id) DEFAULT 1;

-- Add index for report_type_id lookup
CREATE INDEX IF NOT EXISTS idx_shifts_report_type_id ON shifts(report_type_id);


