-- Create vehicle_regions mapping table
CREATE TABLE IF NOT EXISTS vehicle_regions (
    id SERIAL PRIMARY KEY,
    vehicle_id INT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    region_id INT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(vehicle_id) -- A vehicle can only belong to one region/zone at a time
);
