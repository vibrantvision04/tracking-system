-- 028_route_type_vehicle_types.sql
-- Create route_type_vehicle_types mapping table

CREATE TABLE IF NOT EXISTS route_type_vehicle_types (
    id SERIAL PRIMARY KEY,
    route_type_id INT NOT NULL REFERENCES route_types_vswm(id) ON DELETE CASCADE,
    vehicle_type_id INT NOT NULL REFERENCES vehicle_types_vswm(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(route_type_id, vehicle_type_id)
);
