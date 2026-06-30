-- Migration 059: Employee Live Locations
-- Stores periodic GPS location pings from mobile app for real-time employee monitoring

CREATE TABLE IF NOT EXISTS employee_live_locations (
    id BIGSERIAL PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_live_loc_employee ON employee_live_locations(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_live_loc_time ON employee_live_locations(captured_at DESC);

-- Cleanup: remove entries older than 1 hour (keeps table lean)
CREATE INDEX IF NOT EXISTS idx_emp_live_loc_cleanup ON employee_live_locations(created_at);
