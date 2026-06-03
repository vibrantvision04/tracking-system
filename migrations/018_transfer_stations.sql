-- 018_transfer_stations.sql
-- Table for transfer stations

CREATE TABLE IF NOT EXISTS transfer_stations (
    id               SERIAL PRIMARY KEY,
    name             TEXT NOT NULL,
    address          TEXT,
    geofence_id      INT REFERENCES geofences(id) ON DELETE SET NULL,
    is_active        BOOLEAN DEFAULT true,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);
