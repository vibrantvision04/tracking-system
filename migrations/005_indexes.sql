-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_gps_data_imei_captured_at ON gps_data (imei, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_gps_data_captured_at ON gps_data (captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_trips_vehicle_time ON trips (vehicle_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_trips_imei_time ON trips (imei, start_time DESC);

CREATE INDEX IF NOT EXISTS idx_movement_reports_vehicle_date ON movement_reports (vehicle_id, report_date DESC);

CREATE INDEX IF NOT EXISTS idx_geofence_events_vehicle_captured_at ON geofence_events (vehicle_id, captured_at DESC);
