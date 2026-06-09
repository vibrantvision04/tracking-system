-- Migration 036: Open Depot Management Schema

CREATE TABLE IF NOT EXISTS open_depots (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    zone_id INT REFERENCES regions(id) ON DELETE RESTRICT,
    ward_id INT REFERENCES regions(id) ON DELETE RESTRICT,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    radius DOUBLE PRECISION NOT NULL, -- in meters
    status TEXT DEFAULT 'Active',
    cleaning_percentage FLOAT DEFAULT 0.0,
    last_cleaned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS open_depot_cleanings (
    id SERIAL PRIMARY KEY,
    open_depot_id INT REFERENCES open_depots(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    uploaded_by TEXT NOT NULL,
    uploaded_latitude DOUBLE PRECISION NOT NULL,
    uploaded_longitude DOUBLE PRECISION NOT NULL,
    upload_time TIMESTAMPTZ DEFAULT NOW(),
    verification_status TEXT NOT NULL, -- 'VALID_LOCATION', 'OUTSIDE_DEPOT'
    approval_status TEXT DEFAULT 'Pending', -- 'Pending', 'Approved', 'Rejected'
    jhalli_patti_used BOOLEAN,
    approved_by TEXT,
    approved_time TIMESTAMPTZ,
    remarks TEXT
);

-- Indexing for future performance scaling
CREATE INDEX IF NOT EXISTS idx_open_depots_zone_id ON open_depots(zone_id);
CREATE INDEX IF NOT EXISTS idx_open_depots_ward_id ON open_depots(ward_id);
CREATE INDEX IF NOT EXISTS idx_open_depot_cleanings_depot_id ON open_depot_cleanings(open_depot_id);
CREATE INDEX IF NOT EXISTS idx_open_depot_cleanings_status ON open_depot_cleanings(approval_status);
