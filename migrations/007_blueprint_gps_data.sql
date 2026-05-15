-- Blueprint optimized gps_data table
DROP TABLE IF EXISTS gps_data CASCADE;

CREATE TABLE gps_data (
    imei          VARCHAR(15)   NOT NULL,
    captured_at   TIMESTAMPTZ   NOT NULL,
    lat           FLOAT8        NOT NULL,
    lng           FLOAT8        NOT NULL,
    speed         SMALLINT      NOT NULL DEFAULT 0,
    ignition      SMALLINT      NOT NULL DEFAULT 0,  -- 0/1, NOT boolean (alignment)
    odometer      BIGINT        NOT NULL DEFAULT 0,
    hdop          FLOAT4,
    direction     SMALLINT,
    altitude      FLOAT4,
    satellites    SMALLINT,
    signal        SMALLINT,
    PRIMARY KEY (imei, captured_at)
);

-- Using standard index instead of hypertable for Neon compatibility
CREATE INDEX ON gps_data (imei, captured_at DESC);
CREATE INDEX ON gps_data (captured_at DESC);
