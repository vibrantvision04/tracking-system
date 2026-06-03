-- CREATE DESIGNATIONS TABLE
CREATE TABLE IF NOT EXISTS designations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default designations as per screenshot
INSERT INTO designations (name) VALUES 
('Admin'),
('Operator'),
('Driver'),
('CSI'),
('Deputy Commissioner'),
('Additional Commissioner'),
('Helper'),
('HO'),
('NGO Zone Head'),
('Daroga')
ON CONFLICT (name) DO NOTHING;
