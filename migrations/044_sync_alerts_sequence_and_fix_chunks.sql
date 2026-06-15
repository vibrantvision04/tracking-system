-- 044_sync_alerts_sequence_and_fix_chunks.sql
-- Part 1: Reset all primary key sequences in the database to prevent duplicate key violations (e.g. alerts_pkey)
-- We only target tables in the 'public' schema to avoid modifying internal system or TimescaleDB catalogs.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT 
            tc.table_schema,
            tc.table_name, 
            cc.column_name, 
            pg_get_serial_sequence(tc.table_schema || '.' || tc.table_name, cc.column_name) as seq_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        JOIN information_schema.columns cc ON ccu.table_name = cc.table_name AND ccu.column_name = cc.column_name
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = 'public'
          AND pg_get_serial_sequence(tc.table_schema || '.' || tc.table_name, cc.column_name) IS NOT NULL
    LOOP
        EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I.%I), 0) + 1, false)', 
            r.seq_name, r.column_name, r.table_schema, r.table_name);
    END LOOP;
END $$;

-- Part 2: Resolve the TimescaleDB orphaned chunk issue for _hyper_1_2_chunk
-- The error is: relation "_timescaledb_internal._hyper_1_2_chunk" not found
-- We drop the chunk using TimescaleDB's drop_chunks helper for the specific date range: June 14, 2026 to June 16, 2026.
-- This cleans up TimescaleDB's metadata. TimescaleDB will then automatically create a healthy chunk
-- next time GPS data for June 15 is sent.
DO $$
DECLARE
    ts_active BOOLEAN := FALSE;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'
    ) INTO ts_active;

    IF ts_active THEN
        -- Safely drop chunk metadata for the date range covering June 15, 2026
        -- Note: drop_chunks takes 'older_than' and 'newer_than' arguments to bound the drop.
        -- Using timestamptz to safely match the captured_at dimension type.
        BEGIN
            PERFORM drop_chunks(
                relation => 'gps_data',
                older_than => '2026-06-16 00:00:00+00'::timestamptz,
                newer_than => '2026-06-14 00:00:00+00'::timestamptz,
                verbose => true
            );
            RAISE NOTICE 'Orphaned TimescaleDB chunks in the June 14-16 range dropped successfully.';
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Failed to drop chunks: %', SQLERRM;
        END;
    END IF;
END $$;
