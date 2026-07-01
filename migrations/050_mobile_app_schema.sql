-- Migration 050: SWIFT Mobile App Database Schema Additions

CREATE TABLE IF NOT EXISTS mobile_attendance (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          INTEGER NOT NULL REFERENCES employees(id),
  role             VARCHAR(20) NOT NULL,         -- 'driver', 'supervisor', 'zone_manager'
  punch_in_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  punch_out_at     TIMESTAMPTZ,
  punch_out_mode   VARCHAR(10),                 -- 'auto' | 'manual'
  driver_name      VARCHAR(100),
  helper_name      VARCHAR(100),
  helper_present   BOOLEAN DEFAULT FALSE,
  vehicle_id       INTEGER REFERENCES vehicles(id),
  photo_path       VARCHAR(500),                -- server path to stored image
  gps_lat          DECIMAL(10, 7),
  gps_lng          DECIMAL(10, 7),
  ward_id          INTEGER REFERENCES regions(id), -- ward is stored in regions table
  marked_by        INTEGER REFERENCES employees(id),  -- NULL if self, else supervisor_id
  is_valid         BOOLEAN DEFAULT TRUE,
  shift_id         INTEGER REFERENCES shifts(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mobile_blockage_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lane_point_id    INTEGER NOT NULL REFERENCES route_lane_points(id),
  driver_id        INTEGER NOT NULL REFERENCES employees(id),
  vehicle_id       INTEGER NOT NULL REFERENCES vehicles(id),
  photo_path       VARCHAR(500) NOT NULL,
  gps_lat          DECIMAL(10, 7) NOT NULL,
  gps_lng          DECIMAL(10, 7) NOT NULL,
  status           VARCHAR(20) DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  initial_approved BOOLEAN DEFAULT TRUE,
  reviewed_by      INTEGER REFERENCES employees(id),
  reviewed_at      TIMESTAMPTZ,
  submitted_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mobile_open_depot_submissions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  depot_id         INTEGER NOT NULL REFERENCES open_depots(id),
  operator_id      INTEGER NOT NULL REFERENCES employees(id),
  photo_path       VARCHAR(500) NOT NULL,
  gps_lat          DECIMAL(10, 7) NOT NULL,
  gps_lng          DECIMAL(10, 7) NOT NULL,
  shift            VARCHAR(10) NOT NULL,          -- 'morning' | 'evening'
  operational_date DATE NOT NULL DEFAULT CURRENT_DATE,
  submitted_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (depot_id, operator_id, shift, operational_date)
);

-- App Settings table
CREATE TABLE IF NOT EXISTS app_settings (
  id SERIAL PRIMARY KEY,
  manual_punchout_enabled BOOLEAN DEFAULT FALSE
);

-- Seed default settings row if table is empty
INSERT INTO app_settings (id, manual_punchout_enabled)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;
