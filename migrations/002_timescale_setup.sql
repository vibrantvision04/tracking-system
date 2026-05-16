-- Standard PostgreSQL Setup for Neon Database
-- Removed TimescaleDB extension and hypertable creation

-- Raw GPS data table
CREATE TABLE IF NOT EXISTS gps_data (
    imei          TEXT NOT NULL,
    captured_at   TIMESTAMPTZ NOT NULL,
    lat           DOUBLE PRECISION NOT NULL,
    lng           DOUBLE PRECISION NOT NULL,
    speed         FLOAT,
    heading       INT,
    altitude      FLOAT,
    satellites    INT,
    ignition      BOOLEAN DEFAULT false,
    io            JSONB
);

-- Use standard indexes instead of timescale hypertable
CREATE INDEX IF NOT EXISTS idx_gps_data_imei_captured_at ON gps_data (imei, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_gps_data_captured_at ON gps_data (captured_at DESC);
