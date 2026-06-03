-- 024_timescale_scalability.sql
-- Optimizes TimescaleDB configuration for chunk intervals, native compression, retention policies, and continuous aggregates.

DO $$
DECLARE
    ts_available BOOLEAN := FALSE;
BEGIN
    -- 1. Check if TimescaleDB extension is active/loaded in the database
    SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'
    ) INTO ts_available;

    IF ts_available THEN
        
        -- 2. Adjust chunk_time_interval to 1 day for optimal chunk sizing (recommended: 10M-50M rows per chunk)
        -- At 1,000 devices sending telemetry every 1-10s, a 1-day chunk size fits perfectly.
        PERFORM set_chunk_time_interval('gps_data', INTERVAL '1 day');
        RAISE NOTICE 'TimescaleDB hypertable chunk_time_interval set to 1 day successfully.';

        -- 3. Enable Native TimescaleDB chunk compression on gps_data hypertable
        -- Compress older chunks to save ~90% storage space, segmenting by imei for fast historical queries.
        BEGIN
            ALTER TABLE gps_data SET (
                timescaledb.compress,
                timescaledb.compress_segmentby = 'imei',
                timescaledb.compress_orderby = 'captured_at DESC'
            );
            RAISE NOTICE 'TimescaleDB compression enabled on gps_data hypertable.';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'TimescaleDB compression already enabled or failed to alter: %', SQLERRM;
        END;

        -- 4. Add compression policy to automatically compress chunks older than 30 days
        BEGIN
            PERFORM add_compression_policy('gps_data', INTERVAL '30 days', if_not_exists => TRUE);
            RAISE NOTICE 'TimescaleDB 30-day compression policy added.';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Failed to add compression policy: %', SQLERRM;
        END;

        -- 5. Add data retention policy to automatically drop raw chunks older than 2 years (24 months)
        -- This ensures users can perform route playback history and view raw points for up to 2 years!
        -- Note: Compiled daily and monthly reports are stored in 'movement_reports' and are retained forever.
        BEGIN
            -- Cleanly remove any old 6-month policy first if it exists
            PERFORM remove_retention_policy('gps_data', if_exists => TRUE);
            PERFORM add_retention_policy('gps_data', INTERVAL '2 years', if_not_exists => TRUE);
            RAISE NOTICE 'TimescaleDB 2-year raw data retention policy added.';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Failed to add retention policy: %', SQLERRM;
        END;

    ELSE
        RAISE NOTICE 'TimescaleDB not available. Skipping TimescaleDB hypertable optimizations, compression, and retention policies.';
    END IF;
END $$;

-- 6. Create Continuous Aggregates (Hourly Summary View)
-- Since continuous aggregate views are persistent schema objects, we can construct them conditionally or use helper functions.
-- To ensure compatibility with non-Timescale environments, we conditionally define the hourly summary view if TimescaleDB is active,
-- otherwise we fall back to a standard PostgreSQL view.
DO $$
DECLARE
    ts_active BOOLEAN := FALSE;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'
    ) INTO ts_active;

    IF ts_active THEN
        -- Create the hourly continuous aggregate materialized view
        IF NOT EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'gps_hourly_summary') 
           AND NOT EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'gps_hourly_summary') THEN
           
            EXECUTE $CREATE_VIEW$
                CREATE MATERIALIZED VIEW gps_hourly_summary
                WITH (timescaledb.continuous) AS
                SELECT 
                    time_bucket('1 hour', captured_at) AS bucket,
                    imei,
                    AVG(speed) AS avg_speed,
                    MAX(speed) AS max_speed,
                    SUM(distance_delta) AS total_distance,
                    COUNT(*) AS records_count
                FROM gps_data
                GROUP BY bucket, imei
                WITH NO DATA;
            $CREATE_VIEW$;
            
            RAISE NOTICE 'TimescaleDB Continuous Aggregate gps_hourly_summary created successfully.';

            -- Add refresh policy to automatically aggregate data in background
            -- Refresh policy refreshes every 1 hour, looking back 30 days to catch late/buffered packets.
            PERFORM add_continuous_aggregate_policy('gps_hourly_summary',
                start_offset      => INTERVAL '30 days',
                end_offset        => INTERVAL '1 hour',
                schedule_interval => INTERVAL '1 hour',
                if_not_exists     => TRUE
            );
            RAISE NOTICE 'TimescaleDB Continuous Aggregate refresh policy added.';
        END IF;
    ELSE
        -- Fallback: PostgreSQL Standard View for environments without TimescaleDB
        IF NOT EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'gps_hourly_summary') 
           AND NOT EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'gps_hourly_summary') THEN
           
            EXECUTE $CREATE_FALLBACK$
                CREATE OR REPLACE VIEW gps_hourly_summary AS
                SELECT 
                    date_trunc('hour', captured_at) AS bucket,
                    imei,
                    AVG(speed) AS avg_speed,
                    MAX(speed) AS max_speed,
                    SUM(distance_delta) AS total_distance,
                    COUNT(*) AS records_count
                FROM gps_data
                GROUP BY bucket, imei;
            $CREATE_FALLBACK$;
            
            RAISE NOTICE 'Fallback standard PostgreSQL view gps_hourly_summary created successfully.';
        END IF;
    END IF;
END $$;
