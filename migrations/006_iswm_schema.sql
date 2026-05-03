-- ISWM Jaipur Heritage Schema Extensions

-- 1. Vehicle Types (More detailed than initial)
CREATE TABLE IF NOT EXISTS vehicle_types_iswm (
    id                    SERIAL PRIMARY KEY,
    vehicle_type_name     TEXT NOT NULL,
    partitioned           BOOLEAN DEFAULT false,
    collection_source_id  INT,
    type_image            TEXT,
    icon_color            TEXT,
    marker_image          TEXT,
    is_active             BOOLEAN DEFAULT true,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Region Hierarchy
CREATE TABLE IF NOT EXISTS region_types (
    id        SERIAL PRIMARY KEY,
    title     TEXT NOT NULL,   -- 'City', 'Zone', 'Ward'
    parent_id INT REFERENCES region_types(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS regions (
    id                    SERIAL PRIMARY KEY,
    region_name           TEXT NOT NULL,
    geofence_id           INT, -- Will link to geofences table
    parent_id             INT REFERENCES regions(id),
    region_code           TEXT,
    estimated_population  INT,
    region_type_id        INT REFERENCES region_types(id),
    is_active             BOOLEAN DEFAULT true,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Update gps_data to include all ISWM fields
-- We'll add columns to the existing gps_data table
ALTER TABLE gps_data ADD COLUMN IF NOT EXISTS device_type TEXT;
ALTER TABLE gps_data ADD COLUMN IF NOT EXISTS hdop FLOAT;
ALTER TABLE gps_data ADD COLUMN IF NOT EXISTS pdop FLOAT;
ALTER TABLE gps_data ADD COLUMN IF NOT EXISTS direction INT;
ALTER TABLE gps_data ADD COLUMN IF NOT EXISTS odometer BIGINT;
ALTER TABLE gps_data ADD COLUMN IF NOT EXISTS x_axis INT;
ALTER TABLE gps_data ADD COLUMN IF NOT EXISTS y_axis INT;
ALTER TABLE gps_data ADD COLUMN IF NOT EXISTS z_axis INT;
ALTER TABLE gps_data ADD COLUMN IF NOT EXISTS distance_delta FLOAT DEFAULT 0;

-- 4. Movement Reports (Specific ISWM fields)
DROP TABLE IF EXISTS movement_reports; -- Recreating with exact ISWM schema
CREATE TABLE movement_reports (
    id                          BIGSERIAL PRIMARY KEY,
    imei                        TEXT NOT NULL,
    vehicle_id                  INT, -- Linked to vehicles
    report_date                 DATE NOT NULL,
    average_speed               FLOAT,
    total_distance              FLOAT,
    start_point                 JSONB,   -- {x: lng, y: lat}
    end_point                   JSONB,
    start_time                  TIMESTAMPTZ,
    end_time                    TIMESTAMPTZ,
    alert                       INT DEFAULT 0,
    total_active_duration       TEXT,    -- "HH:MM:SS"
    total_idle_duration         TEXT,
    total_stoppage_duration     TEXT,
    in_parking_duration         TEXT,
    actual_ignition_on_duration TEXT,
    total_ignition_on_duration  TEXT,
    total_running_duration      TEXT,
    total_running_time          TEXT,
    day_running_time            TEXT,
    night_running_time          TEXT,
    fuel_in_ltr                 FLOAT DEFAULT 0,
    fuel_consumption            FLOAT DEFAULT 0,
    speed_limit                 FLOAT DEFAULT 0,
    max_speed                   FLOAT DEFAULT 0,
    min_speed                   FLOAT DEFAULT 0,
    overspeed_distance          FLOAT DEFAULT 0,
    overspeed_count             TEXT DEFAULT '0',
    overspeed_time              TEXT DEFAULT '0',
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(imei, report_date)
);

-- 5. Parking Lots
CREATE TABLE IF NOT EXISTS parking_lots (
    id               SERIAL PRIMARY KEY,
    parking_lot_name TEXT NOT NULL,
    address          TEXT,
    contact_no       TEXT,
    geofence_id      INT, -- Link to geofences
    is_active        BOOLEAN DEFAULT true,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Shifts and Routes
CREATE TABLE IF NOT EXISTS shifts (
    id            SERIAL PRIMARY KEY,
    shift_name    TEXT,
    start_time    TIME,
    end_time      TIME,
    time_duration INT,
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS routes (
    id               SERIAL PRIMARY KEY,
    route_name       TEXT,
    identification   TEXT,
    distance         FLOAT,
    route_type_id    INT,
    geometry_id      INT, -- Link to geofences
    is_active        BOOLEAN DEFAULT true,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);
