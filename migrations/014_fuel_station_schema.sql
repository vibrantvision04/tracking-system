-- Create Fuel Companies Table
CREATE TABLE IF NOT EXISTS fuel_companies (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert mock data for fuel companies
INSERT INTO fuel_companies (name) VALUES 
    ('Indian Oil'),
    ('Hindustan Petroleum (HP)'),
    ('Bharat Petroleum (BP)'),
    ('Reliance Petroleum'),
    ('Nayara Energy')
ON CONFLICT DO NOTHING;

-- Create Fuel Stations Table
CREATE TABLE IF NOT EXISTS fuel_stations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    company_id INTEGER REFERENCES fuel_companies(id) ON DELETE SET NULL,
    owner_name TEXT,
    owner_contact_1 TEXT,
    owner_contact_2 TEXT,
    address TEXT,
    geofence_id INTEGER REFERENCES geofences(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
