-- 1. Route Checkpoints (Lane Pointers)
CREATE TABLE IF NOT EXISTS route_checkpoints (
    id SERIAL PRIMARY KEY,
    route_id INT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    checkpoint_name TEXT NOT NULL,
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL,
    radius_meters FLOAT DEFAULT 50.0,
    sequence_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Vehicle Route Assignments
CREATE TABLE IF NOT EXISTS vehicle_route_assignments (
    id SERIAL PRIMARY KEY,
    vehicle_id INT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    route_id INT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    assigned_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(vehicle_id, assigned_date) -- A vehicle typically has one assigned route per day for coverage tracking
);

-- 3. Route Coverage Logs
CREATE TABLE IF NOT EXISTS route_coverage_logs (
    id BIGSERIAL PRIMARY KEY,
    vehicle_id INT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    route_id INT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    checkpoint_id INT NOT NULL REFERENCES route_checkpoints(id) ON DELETE CASCADE,
    hit_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    report_date DATE NOT NULL,
    UNIQUE(vehicle_id, route_id, checkpoint_id, report_date) -- A vehicle can only hit a checkpoint once per day/route combo
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_route_checkpoints_route_id ON route_checkpoints(route_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_route_assignments_date ON vehicle_route_assignments(assigned_date);
CREATE INDEX IF NOT EXISTS idx_route_coverage_logs_lookup ON route_coverage_logs(vehicle_id, report_date, route_id);
