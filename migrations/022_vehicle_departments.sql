-- Create vehicle_departments mapping table
CREATE TABLE IF NOT EXISTS vehicle_departments (
    id SERIAL PRIMARY KEY,
    vehicle_id INT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE UNIQUE,
    department_id INT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default vehicles matching legacy screenshot
INSERT INTO vehicles (name, plate_number, registration_no, vehicle_type_id, is_active)
VALUES 
('GJ06BT8541TA', 'GJ06BT8541TA', 'GJ06BT8541TA', 1, true),
('RJ14GN8110', 'RJ14GN8110', 'RJ14GN8110', 1, true),
('RJ14Q00713', 'RJ14Q00713', 'RJ14Q00713', 1, true),
('RJ14Q00719', 'RJ14Q00719', 'RJ14Q00719', 1, true),
('RJ14Q00780', 'RJ14Q00780', 'RJ14Q00780', 1, true),
('RJ14Q00722', 'RJ14Q00722', 'RJ14Q00722', 1, true),
('RJ14GN5750SW', 'RJ14GN5750SW', 'RJ14GN5750SW', 1, true),
('RJ14GN4286UF', 'RJ14GN4286UF', 'RJ14GN4286UF', 1, true)
ON CONFLICT (registration_no) DO NOTHING;

-- Seed dummy GPS devices and map them so these vehicles show up in general vehicle directories too
INSERT INTO gps_devices (imei, serial_no, sim_no, device_type, is_active)
VALUES 
('350317172709001', 'SN-001', '9999000001', 'FMB120', true),
('350317172709002', 'SN-002', '9999000002', 'FMB120', true),
('350317172709003', 'SN-003', '9999000003', 'FMB120', true),
('350317172709004', 'SN-004', '9999000004', 'FMB120', true),
('350317172709005', 'SN-005', '9999000005', 'FMB120', true),
('350317172709006', 'SN-006', '9999000006', 'FMB120', true),
('350317172709007', 'SN-007', '9999000007', 'FMB120', true),
('350317172709008', 'SN-008', '9999000008', 'FMB120', true)
ON CONFLICT (imei) DO NOTHING;

INSERT INTO vehicle_gps_map (vehicle_id, device_id, assigned_at)
SELECT v.id, d.id, NOW()
FROM vehicles v
JOIN gps_devices d ON (
    (v.registration_no = 'GJ06BT8541TA' AND d.imei = '350317172709001') OR
    (v.registration_no = 'RJ14GN8110' AND d.imei = '350317172709002') OR
    (v.registration_no = 'RJ14Q00713' AND d.imei = '350317172709003') OR
    (v.registration_no = 'RJ14Q00719' AND d.imei = '350317172709004') OR
    (v.registration_no = 'RJ14Q00780' AND d.imei = '350317172709005') OR
    (v.registration_no = 'RJ14Q00722' AND d.imei = '350317172709006') OR
    (v.registration_no = 'RJ14GN5750SW' AND d.imei = '350317172709007') OR
    (v.registration_no = 'RJ14GN4286UF' AND d.imei = '350317172709008')
)
ON CONFLICT DO NOTHING;

-- Seed default mappings to the "Health" department (which has ID 3 in our departments table)
INSERT INTO vehicle_departments (vehicle_id, department_id)
SELECT id, 3 FROM vehicles WHERE registration_no IN (
    'GJ06BT8541TA', 'RJ14GN8110', 'RJ14Q00713', 'RJ14Q00719', 
    'RJ14Q00780', 'RJ14Q00722', 'RJ14GN5750SW', 'RJ14GN4286UF'
)
ON CONFLICT (vehicle_id) DO NOTHING;
