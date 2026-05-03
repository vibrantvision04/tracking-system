-- Enable TimescaleDB
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Raw GPS data table
CREATE TABLE IF NOT EXISTS gps_data (
    imei        TEXT NOT NULL,
    time        TIMESTAMPTZ NOT NULL,
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    speed       FLOAT,
    heading     INT,
    altitude    FLOAT,
    satellites  INT,
    ignition    BOOLEAN DEFAULT false,
    io          JSONB
);

-- Convert to hypertable (partitioned by week)
-- Using IF NOT EXISTS pattern is tricky with hypertables, but usually run once.
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'gps_data') THEN
        PERFORM create_hypertable('gps_data', 'time', chunk_time_interval => INTERVAL '1 week');
    END IF;
END $$;

-- Compression (after 7 days)
ALTER TABLE gps_data SET (
    timescaledb.compress,
    timescaledb.compress_orderby = 'time DESC',
    timescaledb.compress_segmentby = 'imei'
);

-- Only add policies if not already present (simplified here)
DO $$ 
BEGIN
    PERFORM add_compression_policy('gps_data', INTERVAL '7 days');
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Compression policy might already exist';
END $$;

DO $$ 
BEGIN
    PERFORM add_retention_policy('gps_data', INTERVAL '90 days');
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Retention policy might already exist';
END $$;
