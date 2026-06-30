-- Employee ↔ Vehicle persistent assignment (not date-wise).
-- Once assigned, the driver keeps the vehicle until explicitly changed.
CREATE TABLE IF NOT EXISTS employee_vehicle_assignments (
    id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    vehicle_id INT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(employee_id)
);

CREATE INDEX IF NOT EXISTS idx_eva_active ON employee_vehicle_assignments(is_active);
CREATE INDEX IF NOT EXISTS idx_eva_vehicle ON employee_vehicle_assignments(vehicle_id);
