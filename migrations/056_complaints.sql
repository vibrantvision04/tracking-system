-- Migration 056: Complaints persistence (mobile-backend-integration, Req 7.2)
-- Read-only on mobile; creation/editing remains a web concern.
-- Columns align to the Complaint model; ward/vehicle/driver association
-- is the basis for supervisor/driver role scoping (Req 7.4, 7.5).
-- Idempotent: safe to re-run on every startup (migrate_all.go).

CREATE TABLE IF NOT EXISTS complaints (
    id                  BIGSERIAL PRIMARY KEY,
    title               TEXT NOT NULL DEFAULT '',
    description         TEXT NOT NULL DEFAULT '',
    priority            TEXT NOT NULL DEFAULT 'medium', -- low | medium | high | critical
    status              TEXT NOT NULL DEFAULT 'open',   -- open | in_progress | resolved | closed
    ward_id             INT REFERENCES regions(id) ON DELETE SET NULL, -- nullable; ward association for supervisor scoping
    assigned_vehicle_id INT,  -- nullable; vehicle association for driver scoping
    assigned_driver_id  INT,  -- nullable; driver association for driver scoping
    location            JSONB,                  -- nullable; {lat, lng, address?}
    images              JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes supporting role-scoped queries (supervisor/driver)
CREATE INDEX IF NOT EXISTS idx_complaints_ward ON complaints(ward_id);
CREATE INDEX IF NOT EXISTS idx_complaints_assigned_vehicle ON complaints(assigned_vehicle_id);
CREATE INDEX IF NOT EXISTS idx_complaints_assigned_driver ON complaints(assigned_driver_id);
