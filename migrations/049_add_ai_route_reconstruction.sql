-- 049: Add AI Assisted Route Reconstruction configuration and log table
ALTER TABLE routes ADD COLUMN IF NOT EXISTS ai_reconstruction_enabled BOOLEAN DEFAULT false;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS ai_coverage_recovery_enabled BOOLEAN DEFAULT false;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS ai_playback_correction_enabled BOOLEAN DEFAULT false;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS gps_quality_mode VARCHAR(50) DEFAULT 'normal';

CREATE TABLE IF NOT EXISTS vehicle_route_reconstructions (
    id BIGSERIAL PRIMARY KEY,
    vehicle_id INT NOT NULL,
    route_id INT NOT NULL,
    report_date DATE NOT NULL,
    raw_gps_count INT NOT NULL,
    corrected_gps_count INT NOT NULL,
    average_confidence FLOAT NOT NULL,
    reconstructed_path JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_veh_route_reconstr ON vehicle_route_reconstructions(vehicle_id, route_id, report_date);
