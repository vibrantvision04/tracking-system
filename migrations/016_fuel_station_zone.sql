-- Create fuel_station_zones table
CREATE TABLE IF NOT EXISTS fuel_station_zones (
    id SERIAL PRIMARY KEY,
    fuel_station_id INTEGER REFERENCES fuel_stations(id) ON DELETE CASCADE,
    zone_id INTEGER REFERENCES regions(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
