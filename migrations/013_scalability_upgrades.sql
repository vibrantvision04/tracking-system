-- 1. Create latest_gps_data table for sub-millisecond vehicle tracking lookups
CREATE TABLE IF NOT EXISTS latest_gps_data (
    imei          TEXT PRIMARY KEY,
    captured_at   TIMESTAMPTZ NOT NULL,
    lat           DOUBLE PRECISION NOT NULL,
    lng           DOUBLE PRECISION NOT NULL,
    speed         FLOAT,
    heading       INT,
    altitude      FLOAT,
    satellites    INT,
    ignition      BOOLEAN DEFAULT false,
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_latest_gps_captured_at ON latest_gps_data (captured_at DESC);

-- 2. Create persistent alerts table for fast indexed dashboard loads
CREATE TABLE IF NOT EXISTS alerts (
    id             SERIAL PRIMARY KEY,
    alert_type     TEXT NOT NULL,
    imei           TEXT NOT NULL,
    vehicle_id     INT NOT NULL,
    registration_no TEXT NOT NULL,
    ward_no        TEXT,
    driver         TEXT,
    alert_detail   TEXT,
    alert_count    INT DEFAULT 1,
    time_reported  TIMESTAMPTZ NOT NULL,
    status         TEXT DEFAULT 'pending', -- 'pending' / 'resolved'
    reason         TEXT,
    snooze_duration INT DEFAULT 0,
    lat            DOUBLE PRECISION,
    lng            DOUBLE PRECISION,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_vehicle_status ON alerts (vehicle_id, status);
CREATE INDEX IF NOT EXISTS idx_alerts_time_reported ON alerts (time_reported DESC);

-- 3. Dynamic Telemetry Partitioning Strategy: TimescaleDB Hypertable with Native Partitioning Fallback
DO $$
DECLARE
    ts_available BOOLEAN := FALSE;
    is_already_partitioned BOOLEAN := FALSE;
BEGIN
    -- Check if we are already partitioned
    SELECT EXISTS (
        SELECT 1 
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'gps_data' AND c.relkind = 'p'
    ) INTO is_already_partitioned;

    IF NOT is_already_partitioned AND EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'
    ) THEN
        BEGIN
            EXECUTE 'SELECT EXISTS (SELECT 1 FROM _timescaledb_catalog.hypertable WHERE table_name = ''gps_data'')' INTO is_already_partitioned;
        EXCEPTION WHEN OTHERS THEN
            is_already_partitioned := FALSE;
        END;
    END IF;

    IF NOT is_already_partitioned AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'ts_insert_blocker'
    ) THEN
        -- Rename existing gps_data table to a backup table to prepare for partition creation
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'gps_data') THEN
            ALTER TABLE gps_data RENAME TO gps_data_old;
        END IF;

        -- Check if TimescaleDB extension is physically present in the system
        SELECT EXISTS (
            SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb'
        ) INTO ts_available;

        -- Try enabling TimescaleDB extension
        IF ts_available THEN
            BEGIN
                EXECUTE 'CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE';
                ts_available := TRUE;
            EXCEPTION WHEN OTHERS THEN
                ts_available := FALSE;
            END;
        END IF;

        -- Create new partitioned gps_data table structure
        IF ts_available THEN
            -- TimescaleDB Hypertable Table creation
            CREATE TABLE gps_data (
                imei          TEXT NOT NULL,
                captured_at   TIMESTAMPTZ NOT NULL,
                lat           DOUBLE PRECISION NOT NULL,
                lng           DOUBLE PRECISION NOT NULL,
                speed         FLOAT,
                heading       INT,
                altitude      FLOAT,
                satellites    INT,
                ignition      SMALLINT DEFAULT 0,
                io            JSONB,
                device_type   TEXT,
                hdop          FLOAT,
                pdop          FLOAT,
                direction     INT,
                odometer      BIGINT,
                x_axis        INT,
                y_axis        INT,
                z_axis        INT,
                distance_delta FLOAT DEFAULT 0
            );
            
            -- Turn it into a Hypertable
            PERFORM create_hypertable('gps_data', 'captured_at', chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE);
            RAISE NOTICE 'TimescaleDB Hypertable configured successfully.';
        ELSE
            -- Fallback: PostgreSQL Native Monthly Partition table creation
            CREATE TABLE gps_data (
                imei          TEXT NOT NULL,
                captured_at   TIMESTAMPTZ NOT NULL,
                lat           DOUBLE PRECISION NOT NULL,
                lng           DOUBLE PRECISION NOT NULL,
                speed         FLOAT,
                heading       INT,
                altitude      FLOAT,
                satellites    INT,
                ignition      SMALLINT DEFAULT 0,
                io            JSONB,
                device_type   TEXT,
                hdop          FLOAT,
                pdop          FLOAT,
                direction     INT,
                odometer      BIGINT,
                x_axis        INT,
                y_axis        INT,
                z_axis        INT,
                distance_delta FLOAT DEFAULT 0
            ) PARTITION BY RANGE (captured_at);

            -- Automatically create current and future monthly partitions (from 2026-05 through 2027-12)
            EXECUTE 'CREATE TABLE IF NOT EXISTS gps_data_y2026m05 PARTITION OF gps_data FOR VALUES FROM (''2026-05-01 00:00:00+00'') TO (''2026-06-01 00:00:00+00'')';
            EXECUTE 'CREATE TABLE IF NOT EXISTS gps_data_y2026m06 PARTITION OF gps_data FOR VALUES FROM (''2026-06-01 00:00:00+00'') TO (''2026-07-01 00:00:00+00'')';
            EXECUTE 'CREATE TABLE IF NOT EXISTS gps_data_y2026m07 PARTITION OF gps_data FOR VALUES FROM (''2026-07-01 00:00:00+00'') TO (''2026-08-01 00:00:00+00'')';
            EXECUTE 'CREATE TABLE IF NOT EXISTS gps_data_y2026m08 PARTITION OF gps_data FOR VALUES FROM (''2026-08-01 00:00:00+00'') TO (''2026-09-01 00:00:00+00'')';
            EXECUTE 'CREATE TABLE IF NOT EXISTS gps_data_y2026m09 PARTITION OF gps_data FOR VALUES FROM (''2026-09-01 00:00:00+00'') TO (''2026-10-01 00:00:00+00'')';
            EXECUTE 'CREATE TABLE IF NOT EXISTS gps_data_y2026m10 PARTITION OF gps_data FOR VALUES FROM (''2026-10-01 00:00:00+00'') TO (''2026-11-01 00:00:00+00'')';
            EXECUTE 'CREATE TABLE IF NOT EXISTS gps_data_y2026m11 PARTITION OF gps_data FOR VALUES FROM (''2026-11-01 00:00:00+00'') TO (''2026-12-01 00:00:00+00'')';
            EXECUTE 'CREATE TABLE IF NOT EXISTS gps_data_y2026m12 PARTITION OF gps_data FOR VALUES FROM (''2026-12-01 00:00:00+00'') TO (''2027-01-01 00:00:00+00'')';
            
            EXECUTE 'CREATE TABLE IF NOT EXISTS gps_data_y2027m01 PARTITION OF gps_data FOR VALUES FROM (''2027-01-01 00:00:00+00'') TO (''2027-02-01 00:00:00+00'')';
            EXECUTE 'CREATE TABLE IF NOT EXISTS gps_data_y2027m02 PARTITION OF gps_data FOR VALUES FROM (''2027-02-01 00:00:00+00'') TO (''2027-03-01 00:00:00+00'')';
            EXECUTE 'CREATE TABLE IF NOT EXISTS gps_data_y2027m03 PARTITION OF gps_data FOR VALUES FROM (''2027-03-01 00:00:00+00'') TO (''2027-04-01 00:00:00+00'')';
            EXECUTE 'CREATE TABLE IF NOT EXISTS gps_data_y2027m04 PARTITION OF gps_data FOR VALUES FROM (''2027-04-01 00:00:00+00'') TO (''2027-05-01 00:00:00+00'')';
            EXECUTE 'CREATE TABLE IF NOT EXISTS gps_data_y2027m05 PARTITION OF gps_data FOR VALUES FROM (''2027-05-01 00:00:00+00'') TO (''2027-06-01 00:00:00+00'')';
            EXECUTE 'CREATE TABLE IF NOT EXISTS gps_data_y2027m06 PARTITION OF gps_data FOR VALUES FROM (''2027-06-01 00:00:00+00'') TO (''2027-07-01 00:00:00+00'')';
            EXECUTE 'CREATE TABLE IF NOT EXISTS gps_data_y2027m07 PARTITION OF gps_data FOR VALUES FROM (''2027-07-01 00:00:00+00'') TO (''2027-08-01 00:00:00+00'')';
            EXECUTE 'CREATE TABLE IF NOT EXISTS gps_data_y2027m08 PARTITION OF gps_data FOR VALUES FROM (''2027-08-01 00:00:00+00'') TO (''2027-09-01 00:00:00+00'')';
            EXECUTE 'CREATE TABLE IF NOT EXISTS gps_data_y2027m09 PARTITION OF gps_data FOR VALUES FROM (''2027-09-01 00:00:00+00'') TO (''2027-10-01 00:00:00+00'')';
            EXECUTE 'CREATE TABLE IF NOT EXISTS gps_data_y2027m10 PARTITION OF gps_data FOR VALUES FROM (''2027-10-01 00:00:00+00'') TO (''2027-11-01 00:00:00+00'')';
            EXECUTE 'CREATE TABLE IF NOT EXISTS gps_data_y2027m11 PARTITION OF gps_data FOR VALUES FROM (''2027-11-01 00:00:00+00'') TO (''2027-12-01 00:00:00+00'')';
            EXECUTE 'CREATE TABLE IF NOT EXISTS gps_data_y2027m12 PARTITION OF gps_data FOR VALUES FROM (''2027-12-01 00:00:00+00'') TO (''2028-01-01 00:00:00+00'')';

            RAISE NOTICE 'Native PostgreSQL partitioning configured successfully.';
        END IF;

        -- Migrate any existing seed or live tracking data from the old table to the new partitioned table
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'gps_data_old') THEN
            INSERT INTO gps_data (imei, captured_at, lat, lng, speed, heading, altitude, satellites, ignition, io, device_type, hdop, pdop, direction, odometer, x_axis, y_axis, z_axis, distance_delta)
            SELECT imei, captured_at, lat, lng, speed, heading, altitude, satellites, 
                   (CASE WHEN ignition::text IN ('true', '1') THEN 1 ELSE 0 END)::smallint, 
                   io, device_type, hdop, pdop, direction, odometer, x_axis, y_axis, z_axis, distance_delta
            FROM gps_data_old;

            DROP TABLE gps_data_old;
            RAISE NOTICE 'Telemetry history migrated to new partition structure successfully.';
        END IF;

        -- Create standard indices on the new partitioned/hypertable `gps_data`
        CREATE INDEX IF NOT EXISTS idx_gps_data_imei_captured_at ON gps_data (imei, captured_at DESC);
        CREATE INDEX IF NOT EXISTS idx_gps_data_captured_at ON gps_data (captured_at DESC);
    END IF;
END $$;
