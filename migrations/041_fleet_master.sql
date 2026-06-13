-- 041 Fleet Master
-- Replaces the hardcoded vehicle-to-zone mapping that was previously inside the Excel workbook.
-- Each vehicle is assigned to exactly one zone (HMZ, CLZ, KPZ, ANZ, SW, DEPARTED).
-- The 'assigned_zone' value directly determines which sheet the vehicle appears on
-- in the generated Ultimate Report.

CREATE TABLE IF NOT EXISTS fleet_master (
    id             SERIAL PRIMARY KEY,
    vehicle_reg_no TEXT NOT NULL UNIQUE,
    vehicle_type   TEXT,                    -- e.g. 'D2D_HOPPER', 'COMPACTOR', 'SW'
    assigned_zone  TEXT NOT NULL,           -- 'HMZ' | 'CLZ' | 'KPZ' | 'ANZ' | 'SW' | 'DEPARTED'
    assigned_ward  TEXT,                    -- e.g. 'Ward 1', 'Ward 2'
    is_active      BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fleet_master_zone   ON fleet_master(assigned_zone);
CREATE INDEX IF NOT EXISTS idx_fleet_master_active ON fleet_master(is_active);
