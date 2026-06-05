-- 034 Create route_coverage_miss_reasons table
CREATE TABLE IF NOT EXISTS route_coverage_miss_reasons (
    id BIGSERIAL PRIMARY KEY,
    vehicle_id INT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    route_id INT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    checkpoint_id INT NOT NULL REFERENCES route_checkpoints(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(vehicle_id, route_id, checkpoint_id, report_date)
);
