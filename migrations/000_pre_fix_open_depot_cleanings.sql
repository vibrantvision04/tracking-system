-- Fix open_depot_cleanings before migration 045 runs.
-- 045 tries to backfill shift_id with fallback to id=1,
-- which fails if no such shift exists or existing data has invalid shift_id.
-- This runs before 001_initial_schema.sql (000 < 001 alphabetically).

DO $$
BEGIN
  -- Only proceed if tables exist (database has been initialized before)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'open_depot_cleanings') THEN
    -- Drop FK if it exists (from a previous partial 045 run)
    EXECUTE 'ALTER TABLE open_depot_cleanings DROP CONSTRAINT IF EXISTS open_depot_cleanings_shift_id_fkey';

    -- Nullify any invalid shift_id values
    UPDATE open_depot_cleanings SET shift_id = NULL
    WHERE shift_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM shifts WHERE id = shift_id);
  END IF;

  -- Ensure a shift with id=1 exists for the backfill in migration 045
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shifts') THEN
    INSERT INTO shifts (id, shift_name, start_time, end_time, is_active)
    SELECT 1, 'Morning Default', '06:00:00', '14:00:00', true
    WHERE NOT EXISTS (SELECT 1 FROM shifts WHERE id = 1);
  END IF;
END $$;
