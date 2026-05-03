-- 1. Correct the 'vehicles' table
-- Add new columns if they don't exist
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS registration_no TEXT UNIQUE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS chassis_no TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS is_owned BOOLEAN DEFAULT true;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS vehicle_type_id INT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- If 'plate_number' exists, migrate it to 'registration_no'
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vehicles' AND column_name='plate_number') THEN
        UPDATE vehicles SET registration_no = plate_number WHERE registration_no IS NULL;
    END IF;
END $$;

-- 2. Correct the 'gps_devices' table
ALTER TABLE gps_devices ADD COLUMN IF NOT EXISTS serial_no TEXT;
ALTER TABLE gps_devices ADD COLUMN IF NOT EXISTS sim_no TEXT;
ALTER TABLE gps_devices ADD COLUMN IF NOT EXISTS device_type TEXT;
ALTER TABLE gps_devices ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Migrate 'sim_number' to 'sim_no' if it exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='gps_devices' AND column_name='sim_number') THEN
        UPDATE gps_devices SET sim_no = sim_number WHERE sim_no IS NULL;
    END IF;
END $$;

-- 3. Ensure 'vehicle_types_iswm' exists
CREATE TABLE IF NOT EXISTS vehicle_types_iswm (
    id                    SERIAL PRIMARY KEY,
    vehicle_type_name     TEXT NOT NULL,
    icon_color            TEXT,
    is_active             BOOLEAN DEFAULT true,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default types for ISWM
INSERT INTO vehicle_types_iswm (vehicle_type_name, icon_color)
VALUES 
('RCV (Compactor)', '#3b82f6'),
('Hopper Tipper', '#10b981'),
('Sweeping Machine', '#f59e0b'),
('Dumper Placer', '#ef4444'),
('Mini Tipper', '#8b5cf6'),
('Cranes', '#f43f5e')
ON CONFLICT DO NOTHING;

-- 4. Fix 'gps_data' table (for TimescaleDB)
ALTER TABLE gps_data ADD COLUMN IF NOT EXISTS hdop FLOAT;
ALTER TABLE gps_data ADD COLUMN IF NOT EXISTS pdop FLOAT;
ALTER TABLE gps_data ADD COLUMN IF NOT EXISTS odometer BIGINT;
ALTER TABLE gps_data ADD COLUMN IF NOT EXISTS x_axis INT;
ALTER TABLE gps_data ADD COLUMN IF NOT EXISTS y_axis INT;
ALTER TABLE gps_data ADD COLUMN IF NOT EXISTS z_axis INT;
ALTER TABLE gps_data ADD COLUMN IF NOT EXISTS heading INT;
ALTER TABLE gps_data ADD COLUMN IF NOT EXISTS altitude FLOAT;
ALTER TABLE gps_data ADD COLUMN IF NOT EXISTS satellites INT;
ALTER TABLE gps_data ADD COLUMN IF NOT EXISTS ignition BOOLEAN DEFAULT false;
ALTER TABLE gps_data ADD COLUMN IF NOT EXISTS io JSONB;

-- 5. Final mapping check
CREATE TABLE IF NOT EXISTS vehicle_gps_map (
    vehicle_id INT REFERENCES vehicles(id),
    device_id INT REFERENCES gps_devices(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    unassigned_at TIMESTAMPTZ,
    PRIMARY KEY (vehicle_id, device_id, assigned_at)
);
