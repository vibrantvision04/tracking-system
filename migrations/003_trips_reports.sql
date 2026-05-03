-- Trips table
CREATE TABLE IF NOT EXISTS trips (
    id SERIAL PRIMARY KEY,
    vehicle_id INT REFERENCES vehicles(id),
    imei TEXT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    distance FLOAT DEFAULT 0,
    max_speed FLOAT DEFAULT 0,
    avg_speed FLOAT DEFAULT 0,
    start_lat DOUBLE PRECISION,
    start_lng DOUBLE PRECISION,
    end_lat DOUBLE PRECISION,
    end_lng DOUBLE PRECISION,
    path JSONB -- downsampled polyline [{lat,lng,t}]
);

-- Movement reports table
CREATE TABLE IF NOT EXISTS movement_reports (
    id SERIAL PRIMARY KEY,
    vehicle_id INT REFERENCES vehicles(id),
    report_date DATE NOT NULL,
    total_distance FLOAT DEFAULT 0,
    avg_speed FLOAT DEFAULT 0,
    max_speed FLOAT DEFAULT 0,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    ignition_on_duration INT DEFAULT 0, -- seconds
    idle_duration INT DEFAULT 0,        -- seconds (ignition ON, speed < 5)
    stoppage_duration INT DEFAULT 0,    -- seconds (ignition OFF)
    total_trips INT DEFAULT 0,
    start_lat DOUBLE PRECISION,
    start_lng DOUBLE PRECISION,
    end_lat DOUBLE PRECISION,
    end_lng DOUBLE PRECISION,
    UNIQUE(vehicle_id, report_date)
);
