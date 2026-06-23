-- Create route_lane_points
CREATE TABLE IF NOT EXISTS route_lane_points (
    id SERIAL PRIMARY KEY,
    route_id INT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    sequence_number INT NOT NULL,
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(route_id, sequence_number)
);

-- Create vehicle_lane_point_logs
CREATE TABLE IF NOT EXISTS vehicle_lane_point_logs (
    id BIGSERIAL PRIMARY KEY,
    vehicle_id INT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    route_id INT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    lane_point_id INT NOT NULL REFERENCES route_lane_points(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    status TEXT NOT NULL, -- 'achieved', 'missed', 'pending'
    hit_time TIMESTAMPTZ,
    violation_occurred BOOLEAN DEFAULT false,
    completed_at TIMESTAMPTZ,
    UNIQUE(vehicle_id, route_id, lane_point_id, report_date)
);

-- Create vehicle_lane_point_coverage
CREATE TABLE IF NOT EXISTS vehicle_lane_point_coverage (
    vehicle_id INT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    route_id INT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    total_points INT NOT NULL,
    covered_points INT NOT NULL,
    coverage_percent FLOAT NOT NULL,
    in_order BOOLEAN NOT NULL DEFAULT true,
    violation_occurred BOOLEAN NOT NULL DEFAULT false,
    details JSONB,
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (vehicle_id, route_id, report_date)
);
