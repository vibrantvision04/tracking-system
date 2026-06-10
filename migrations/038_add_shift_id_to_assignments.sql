-- 038_add_shift_id_to_assignments.sql
-- Drop the single vehicle unique constraint and enable shift-based route assignment

-- 1. Drop existing unique constraint
ALTER TABLE vehicle_route_assignments DROP CONSTRAINT IF EXISTS vehicle_route_assignments_vehicle_id_assigned_date_key;

-- 2. Add shift_id column
ALTER TABLE vehicle_route_assignments ADD COLUMN IF NOT EXISTS shift_id INT REFERENCES shifts(id) ON DELETE CASCADE;

-- 3. Backfill shift_id based on assigned route's shift_id
UPDATE vehicle_route_assignments va
SET shift_id = r.shift_id
FROM routes r
WHERE va.route_id = r.id AND va.shift_id IS NULL;

-- 4. Reconcile any remaining NULL values (default to Morning Shift = 1)
UPDATE vehicle_route_assignments SET shift_id = 1 WHERE shift_id IS NULL;

-- 5. Set column as NOT NULL
ALTER TABLE vehicle_route_assignments ALTER COLUMN shift_id SET NOT NULL;

-- 6. Add new unique constraint for vehicle, shift, and date combination
ALTER TABLE vehicle_route_assignments DROP CONSTRAINT IF EXISTS vehicle_route_assignments_vehicle_shift_date_key;
ALTER TABLE vehicle_route_assignments ADD CONSTRAINT vehicle_route_assignments_vehicle_shift_date_key UNIQUE (vehicle_id, shift_id, assigned_date);
