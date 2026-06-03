-- 027_temporary_vehicles.sql
-- Create temporary_vehicles mapping table

CREATE TABLE IF NOT EXISTS temporary_vehicles (
    id SERIAL PRIMARY KEY,
    ward_id INT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    shift_id INT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    route_id INT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    vehicle_id INT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    assignment_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(route_id, shift_id, assignment_date)
);
