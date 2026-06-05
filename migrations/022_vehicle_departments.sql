-- Create vehicle_departments mapping table
CREATE TABLE IF NOT EXISTS vehicle_departments (
    id SERIAL PRIMARY KEY,
    vehicle_id INT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE UNIQUE,
    department_id INT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
