-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL, -- admin/manager/viewer
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vehicles table
CREATE TABLE IF NOT EXISTS vehicles (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    plate_number TEXT UNIQUE NOT NULL,
    vehicle_type TEXT, -- car/truck/bus/motorcycle
    owner_id INT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- GPS Devices table
CREATE TABLE IF NOT EXISTS gps_devices (
    id SERIAL PRIMARY KEY,
    imei TEXT UNIQUE NOT NULL,
    model TEXT,
    firmware_version TEXT,
    sim_number TEXT,
    status TEXT DEFAULT 'active', -- active/inactive/maintenance
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vehicle GPS Mapping
CREATE TABLE IF NOT EXISTS vehicle_gps_map (
    vehicle_id INT REFERENCES vehicles(id),
    device_id INT REFERENCES gps_devices(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    unassigned_at TIMESTAMPTZ,
    PRIMARY KEY (vehicle_id, device_id, assigned_at)
);
