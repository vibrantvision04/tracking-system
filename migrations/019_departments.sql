-- CREATE DEPARTMENTS TABLE
CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default departments as per screenshot
INSERT INTO departments (name) VALUES 
('Workshop'),
('Garden'),
('Health'),
('wealth'),
('pwd'),
('account')
ON CONFLICT (name) DO NOTHING;
