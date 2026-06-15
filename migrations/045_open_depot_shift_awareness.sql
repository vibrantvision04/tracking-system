-- Migration 045: Open Depot Shift Awareness
-- Add shift_id and operational_date columns to open_depot_cleanings

-- 1. Add shift_id and operational_date columns to cleanings
ALTER TABLE open_depot_cleanings ADD COLUMN IF NOT EXISTS shift_id INT REFERENCES shifts(id) ON DELETE SET NULL;
ALTER TABLE open_depot_cleanings ADD COLUMN IF NOT EXISTS operational_date DATE;

-- 2. Backfill shift_id based on upload_time using active shifts
UPDATE open_depot_cleanings
SET shift_id = COALESCE(
    (SELECT id FROM shifts 
     WHERE is_active = true AND (
         (start_time <= end_time AND upload_time::TIME >= start_time AND upload_time::TIME <= end_time)
         OR
         (start_time > end_time AND (upload_time::TIME >= start_time OR upload_time::TIME <= end_time))
     ) LIMIT 1),
    1
)
WHERE shift_id IS NULL;

-- 3. Backfill operational_date based on upload_time (accounting for midnight crossing shifts)
UPDATE open_depot_cleanings
SET operational_date = CASE
    WHEN EXISTS (
        SELECT 1 FROM shifts WHERE id = open_depot_cleanings.shift_id AND start_time > end_time
    ) AND EXTRACT(HOUR FROM upload_time AT TIME ZONE 'Asia/Kolkata') < 6 
    THEN (upload_time AT TIME ZONE 'Asia/Kolkata' - INTERVAL '1 day')::DATE
    ELSE (upload_time AT TIME ZONE 'Asia/Kolkata')::DATE
END
WHERE operational_date IS NULL;

-- 4. Add index for query performance
CREATE INDEX IF NOT EXISTS idx_open_depot_cleanings_op_shift ON open_depot_cleanings(operational_date, shift_id);
