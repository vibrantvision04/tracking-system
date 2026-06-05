-- ============================================================
-- 025: Seed Operational Data for Jaipur ISWM D2D Dashboard
-- ============================================================

-- Ensure zone_id and ward_id columns exist on vehicles table
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS zone_id INT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ward_id INT;

-- Ensure shift_id column exists on routes table
ALTER TABLE routes ADD COLUMN IF NOT EXISTS shift_id INT;

-- 1. Region Types (City > Zone > Ward hierarchy)
INSERT INTO region_types (id, title, parent_id, is_active) VALUES
  (1, 'City',   NULL, true),
  (2, 'Zone',   1,    true),
  (3, 'Ward',   2,    true)
ON CONFLICT (id) DO NOTHING;

-- 5. Shifts (Morning covers the current 17:xx UTC / 23:xx IST - night shift active)
INSERT INTO shifts (id, shift_name, start_time, end_time, time_duration, is_active) VALUES
  (1, 'Morning Shift',   '06:00:00', '14:00:00', 480, true),
  (2, 'Afternoon Shift', '14:00:00', '22:00:00', 480, true),
  (3, 'Night Shift',     '22:00:00', '06:00:00', 480, true)
ON CONFLICT (id) DO NOTHING;

-- 6. Routes (linked to shifts)
INSERT INTO routes (id, route_name, identification, distance, shift_id, is_active) VALUES
  (1,  'Ward 1 D2D Route',  'W1-D2D',  12.5, 1, true),
  (2,  'Ward 2 D2D Route',  'W2-D2D',  11.2, 1, true),
  (3,  'Ward 3 D2D Route',  'W3-D2D',  13.0, 1, true),
  (4,  'Ward 4 D2D Route',  'W4-D2D',  10.8, 1, true),
  (5,  'Ward 5 D2D Route',  'W5-D2D',  14.1, 2, true),
  (6,  'Ward 6 D2D Route',  'W6-D2D',  12.0, 2, true),
  (7,  'Ward 7 D2D Route',  'W7-D2D',  11.5, 2, true),
  (8,  'Ward 8 D2D Route',  'W8-D2D',  13.8, 3, true)
ON CONFLICT (id) DO NOTHING;

-- Update vehicle_type_id to spread across types for visual variety
UPDATE vehicles SET vehicle_type_id = 1 WHERE id IN (1, 2);
UPDATE vehicles SET vehicle_type_id = 2 WHERE id IN (3, 4);
UPDATE vehicles SET vehicle_type_id = 3 WHERE id = 5;
UPDATE vehicles SET vehicle_type_id = 4 WHERE id = 6;
UPDATE vehicles SET vehicle_type_id = 5 WHERE id = 7;
UPDATE vehicles SET vehicle_type_id = 6 WHERE id = 8;


-- 10. Route checkpoints (using correct column names: latitude/longitude/sequence_order)
INSERT INTO route_checkpoints (route_id, checkpoint_name, latitude, longitude, radius_meters, sequence_order)
VALUES
  (1, 'Transfer Station Entry',  26.9240, 75.8267, 150, 1),
  (1, 'Ward 1 Checkpoint A',     26.9180, 75.8200, 100, 2),
  (1, 'Ward 1 Checkpoint B',     26.9150, 75.8150, 100, 3),
  (1, 'Ward 1 Checkpoint C',     26.9100, 75.8100, 100, 4),
  (2, 'Ward 2 Checkpoint A',     26.9280, 75.8310, 150, 1),
  (2, 'Ward 2 Checkpoint B',     26.9300, 75.8350, 100, 2),
  (3, 'Ward 3 Checkpoint A',     26.9050, 75.8400, 150, 1),
  (3, 'Ward 3 Checkpoint B',     26.9020, 75.8450, 100, 2)
ON CONFLICT DO NOTHING;

SELECT 'Seed data inserted successfully' as status;
