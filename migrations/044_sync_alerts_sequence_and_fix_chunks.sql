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
-- Safeguard: Only run drop_chunks if the orphaned chunk metadata is detected (exists in catalog but physically missing).
-- This ensures that on future restarts, new healthy chunks (like _hyper_1_24_chunk) are NOT dropped.
DO $$
DECLARE
    ts_active BOOLEAN := FALSE;
    orphaned_chunk_exists BOOLEAN := FALSE;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'
    ) INTO ts_active;

    IF ts_active THEN
        -- Check if _hyper_1_2_chunk exists in TimescaleDB catalog but is physically missing from pg_class
        SELECT EXISTS (
            SELECT 1 
            FROM _timescaledb_catalog.chunk c
            LEFT JOIN pg_class p ON p.relname = c.table_name AND p.relnamespace::regnamespace::text = c.schema_name
            WHERE c.table_name = '_hyper_1_2_chunk' AND p.oid IS NULL
        ) INTO orphaned_chunk_exists;

        IF orphaned_chunk_exists THEN
            RAISE NOTICE 'Orphaned chunk _hyper_1_2_chunk detected. Cleaning up...';
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
        ELSE
            RAISE NOTICE 'No orphaned chunk _hyper_1_2_chunk detected. Skipping cleanup to prevent any data loss.';
        END IF;
    END IF;
END $$;
