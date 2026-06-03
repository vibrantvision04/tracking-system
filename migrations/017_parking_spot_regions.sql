-- 017_parking_spot_regions.sql
-- Mapping table between parking_lots and regions (Zones/Wards)

CREATE TABLE IF NOT EXISTS parking_spot_regions (
    id SERIAL PRIMARY KEY,
    parking_spot_id INT REFERENCES parking_lots(id) ON DELETE CASCADE,
    region_id INT REFERENCES regions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(parking_spot_id, region_id)
);
