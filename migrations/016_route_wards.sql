-- 016_route_wards.sql
-- Create route_wards mapping table

CREATE TABLE IF NOT EXISTS route_wards (
    id SERIAL PRIMARY KEY,
    route_id INT REFERENCES routes(id) ON DELETE CASCADE,
    ward_id INT REFERENCES regions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(route_id, ward_id)
);
