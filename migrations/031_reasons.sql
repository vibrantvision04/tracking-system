-- 031_reasons.sql
-- Create reasons table and seed mock reasons

CREATE TABLE IF NOT EXISTS reasons (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT NOT NULL,
    snooze BOOLEAN DEFAULT false,
    status BOOLEAN DEFAULT true,
    reason_text BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO reasons (name, description, snooze, status, reason_text) VALUES
('Going to Rc Point', 'going to rc point', true, true, false),
('At Fuel Pump', 'Taking Time at Fuel Pump', true, true, false),
('GPS device was stolen', 'GPS device was stolen', true, true, false),
('GPS device is faulty', 'GPS device is faulty', true, true, false),
('Vehicle is under maintenance', 'Vehicle is under maintenance', true, true, false),
('At Fuel Station', 'At Fuel Station', false, true, false),
('At Attendance point', 'At Attendance point', false, true, false),
('At GTS', 'At GTS point', false, true, false),
('Request Vehicle-Driver replacement', 'Vehicle-Driver needs replacement', false, true, false),
('Other Invalid reason', 'Other Invalid reason', true, true, true),
('Parked at Unassigned Parking', 'Parked at Unassigned Parking', true, true, false),
('Replace Helper', 'Replace Helper', false, true, false)
ON CONFLICT (name) DO NOTHING;
