-- Geofences table
CREATE TABLE IF NOT EXISTS geofences (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- circle / polygon
    polygon JSONB NOT NULL, -- GeoJSON format
    color TEXT DEFAULT '#FF0000',
    owner_id INT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Geofence events table
CREATE TABLE IF NOT EXISTS geofence_events (
    id SERIAL PRIMARY KEY,
    vehicle_id INT REFERENCES vehicles(id),
    geofence_id INT REFERENCES geofences(id),
    event_type TEXT NOT NULL, -- enter / exit
    captured_at TIMESTAMPTZ NOT NULL,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS idx_geofence_events_vehicle_captured_at ON geofence_events (vehicle_id, captured_at DESC);
