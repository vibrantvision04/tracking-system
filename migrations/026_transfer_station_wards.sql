-- 026_transfer_station_wards.sql
-- Create transfer_station_wards mapping table

CREATE TABLE IF NOT EXISTS transfer_station_wards (
    id SERIAL PRIMARY KEY,
    transfer_station_id INT REFERENCES transfer_stations(id) ON DELETE CASCADE,
    ward_id INT REFERENCES regions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(transfer_station_id, ward_id)
);
