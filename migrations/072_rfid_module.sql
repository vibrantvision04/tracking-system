-- Migration 072: RFID / Property Lifecycle Management System
-- Copyright (c) 2026 Vibrant Visions. All rights reserved.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Survey Form Configuration (dynamic field definitions, config-driven)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rfid_survey_form_config (
  id               SERIAL PRIMARY KEY,
  field_key        VARCHAR(100) UNIQUE NOT NULL,
  label            VARCHAR(200)        NOT NULL,
  field_type       VARCHAR(50)         NOT NULL, -- text|number|select|multiselect|date|boolean|textarea
  options          JSONB,                         -- for select/multiselect: [{"value":"X","label":"Y"}]
  is_required      BOOLEAN DEFAULT FALSE,
  display_order    INTEGER DEFAULT 0,
  section          VARCHAR(100),                  -- property|location|contact|financial
  placeholder      VARCHAR(200),
  helper_text      VARCHAR(500),
  validation_regex VARCHAR(500),
  is_active        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Property Master (one per RFID, permanent RFID→Property mapping)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rfid_properties (
  id                    SERIAL PRIMARY KEY,
  rfid_id               VARCHAR(100) UNIQUE NOT NULL, -- IMMUTABLE after registration

  -- Status Workflow
  registration_status   VARCHAR(30) NOT NULL DEFAULT 'draft',
    -- draft | pending_approval | approved | rejected | inactive | deleted
  registered_by_id      INTEGER REFERENCES employees(id),
  registered_by_role    VARCHAR(30),
  registration_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  approved_by_id        INTEGER REFERENCES employees(id),
  approved_at           TIMESTAMPTZ,
  rejection_reason      TEXT,

  -- Property Info
  property_status       VARCHAR(50),
  property_type         VARCHAR(200),
  property_sub_type     VARCHAR(200),
  owner_first_name      VARCHAR(100),
  owner_middle_name     VARCHAR(100),
  owner_last_name       VARCHAR(100),
  mobile_number         VARCHAR(20),
  email                 VARCHAR(200),
  address               TEXT,
  landmark              TEXT,
  house_no              VARCHAR(50),
  floor                 VARCHAR(50),
  num_flats             INTEGER,
  num_floors            INTEGER,
  family_members        INTEGER,
  pin_code              VARCHAR(10),
  aadhaar               VARCHAR(20),

  -- Location
  zone_id               INTEGER REFERENCES regions(id),
  ward_id               INTEGER REFERENCES regions(id),
  area                  VARCHAR(200),
  colony_name           VARCHAR(200),
  plot_no               VARCHAR(100),
  zone_name             VARCHAR(100),
  ward_name             VARCHAR(100),

  -- GPS at registration (full snapshot)
  latitude              DECIMAL(11, 7),
  longitude             DECIMAL(11, 7),
  gps_accuracy          DECIMAL(8, 2),
  gps_altitude          DECIMAL(10, 2),
  gps_heading           DECIMAL(6, 2),
  gps_speed             DECIMAL(8, 2),
  gps_timestamp         TIMESTAMPTZ,
  gps_device_id         VARCHAR(100),

  -- Photo
  photo_path            VARCHAR(500),

  -- Financial
  monthly_charge_paisa  INTEGER NOT NULL DEFAULT 0,
  household_radius_m    INTEGER DEFAULT 10,
  bin_type              VARCHAR(100),
  waste_category        VARCHAR(100),
  remarks               TEXT,

  -- Dynamic extra fields
  form_data             JSONB DEFAULT '{}',

  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Property Images
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rfid_property_images (
  id            SERIAL PRIMARY KEY,
  property_id   INTEGER NOT NULL REFERENCES rfid_properties(id) ON DELETE CASCADE,
  photo_path    VARCHAR(500) NOT NULL,
  is_primary    BOOLEAN DEFAULT TRUE,
  captured_by   INTEGER REFERENCES employees(id),
  latitude      DECIMAL(11, 7),
  longitude     DECIMAL(11, 7),
  accuracy      DECIMAL(8, 2),
  altitude      DECIMAL(10, 2),
  heading       DECIMAL(6, 2),
  speed         DECIMAL(8, 2),
  gps_timestamp TIMESTAMPTZ,
  device_id     VARCHAR(100),
  captured_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Payment Transactions
--    Outstanding = (months_elapsed * monthly_charge_paisa) - SUM(amount_paid)
--    Calculated on-demand. No monthly ledger rows. No cron job.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rfid_payment_transactions (
  id                  SERIAL PRIMARY KEY,
  property_id         INTEGER NOT NULL REFERENCES rfid_properties(id),
  amount_due_before   INTEGER NOT NULL,
  amount_paid         INTEGER NOT NULL,
  remaining_amount    INTEGER NOT NULL,
  payment_month       INTEGER NOT NULL CHECK (payment_month BETWEEN 1 AND 12),
  payment_year        INTEGER NOT NULL,
  payment_source      VARCHAR(50)  DEFAULT 'cash',
  payment_status      VARCHAR(30)  DEFAULT 'completed',
  collected_by_id     INTEGER REFERENCES employees(id),
  collected_by_role   VARCHAR(30),
  collection_device   VARCHAR(100),
  receipt_number      VARCHAR(100) UNIQUE,
  pos_reference       VARCHAR(200),
  remarks             TEXT,
  collected_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RFID Scan Audit Log (every scan, every purpose, all roles)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rfid_scan_log (
  id            BIGSERIAL PRIMARY KEY,
  rfid_id       VARCHAR(100) NOT NULL,
  property_id   INTEGER REFERENCES rfid_properties(id),
  scanned_by    INTEGER REFERENCES employees(id),
  role          VARCHAR(30),
  scan_method   VARCHAR(30) NOT NULL,
  scan_purpose  VARCHAR(50),
  scan_result   VARCHAR(30),
  latitude      DECIMAL(11, 7),
  longitude     DECIMAL(11, 7),
  accuracy      DECIMAL(8, 2),
  altitude      DECIMAL(10, 2),
  heading       DECIMAL(6, 2),
  speed         DECIMAL(8, 2),
  device_id     VARCHAR(100),
  scanned_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Coverage Log
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rfid_coverage_log (
  id             BIGSERIAL PRIMARY KEY,
  property_id    INTEGER NOT NULL REFERENCES rfid_properties(id),
  coverage_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  coverage_type  VARCHAR(20) NOT NULL,
  driver_id      INTEGER REFERENCES employees(id),
  vehicle_id     INTEGER REFERENCES vehicles(id),
  latitude       DECIMAL(11, 7),
  longitude      DECIMAL(11, 7),
  accuracy       DECIMAL(8, 2),
  distance_m     DECIMAL(8, 2),
  num_gps_points INTEGER DEFAULT 1,
  dwell_seconds  INTEGER DEFAULT 0,
  covered_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. GPS Dwell Buffer (enforces 2-ping rule before crediting GPS coverage)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rfid_gps_dwell_buffer (
  id           BIGSERIAL PRIMARY KEY,
  property_id  INTEGER NOT NULL REFERENCES rfid_properties(id) ON DELETE CASCADE,
  vehicle_id   INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  first_ping   TIMESTAMPTZ NOT NULL,
  last_ping    TIMESTAMPTZ NOT NULL,
  ping_count   INTEGER DEFAULT 1,
  expires_at   TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS rfid_gps_dwell_buffer_unique_idx ON rfid_gps_dwell_buffer(property_id, vehicle_id, ((first_ping AT TIME ZONE 'UTC')::date));

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Offline Sync Queue
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rfid_sync_queue (
  id                BIGSERIAL PRIMARY KEY,
  device_id         VARCHAR(100) NOT NULL,
  employee_id       INTEGER REFERENCES employees(id),
  action_type       VARCHAR(50) NOT NULL,
  payload           JSONB NOT NULL,
  local_uuid        VARCHAR(100) UNIQUE NOT NULL,
  sync_status       VARCHAR(30) DEFAULT 'pending',
  error_msg         TEXT,
  retry_count       INTEGER DEFAULT 0,
  created_at_device TIMESTAMPTZ NOT NULL,
  received_at       TIMESTAMPTZ DEFAULT NOW(),
  processed_at      TIMESTAMPTZ
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rfid_props_rfid_id   ON rfid_properties(rfid_id);
CREATE INDEX IF NOT EXISTS idx_rfid_props_ward       ON rfid_properties(ward_id);
CREATE INDEX IF NOT EXISTS idx_rfid_props_zone       ON rfid_properties(zone_id);
CREATE INDEX IF NOT EXISTS idx_rfid_props_status     ON rfid_properties(registration_status);
CREATE INDEX IF NOT EXISTS idx_rfid_props_reg_date   ON rfid_properties(registration_date);
CREATE INDEX IF NOT EXISTS idx_rfid_props_gps        ON rfid_properties(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rfid_payment_prop     ON rfid_payment_transactions(property_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_rfid_payment_date     ON rfid_payment_transactions(payment_year, payment_month);
CREATE INDEX IF NOT EXISTS idx_rfid_payment_by       ON rfid_payment_transactions(collected_by_id);

CREATE INDEX IF NOT EXISTS idx_rfid_coverage_prop    ON rfid_coverage_log(property_id, coverage_date);
CREATE INDEX IF NOT EXISTS idx_rfid_coverage_date    ON rfid_coverage_log(coverage_date);
CREATE INDEX IF NOT EXISTS idx_rfid_coverage_vehicle ON rfid_coverage_log(vehicle_id, coverage_date);
CREATE INDEX IF NOT EXISTS idx_rfid_coverage_driver  ON rfid_coverage_log(driver_id, coverage_date);

CREATE INDEX IF NOT EXISTS idx_rfid_scan_rfid        ON rfid_scan_log(rfid_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_rfid_scan_user        ON rfid_scan_log(scanned_by, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_rfid_scan_purpose     ON rfid_scan_log(scan_purpose, scanned_at DESC);

CREATE INDEX IF NOT EXISTS idx_rfid_dwell_vehicle    ON rfid_gps_dwell_buffer(vehicle_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_rfid_dwell_expires    ON rfid_gps_dwell_buffer(expires_at);

CREATE INDEX IF NOT EXISTS idx_rfid_sync_status      ON rfid_sync_queue(sync_status, received_at);
CREATE INDEX IF NOT EXISTS idx_rfid_sync_device      ON rfid_sync_queue(device_id, sync_status);

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: Default Survey Form Configuration
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO rfid_survey_form_config
  (field_key, label, field_type, options, is_required, display_order, section, placeholder)
VALUES
  ('property_status', 'Property Type', 'select', '[
    {"value":"RESIDENTIAL","label":"Residential"},
    {"value":"COMMERCIAL","label":"Commercial"},
    {"value":"INDUSTRIAL","label":"Industrial"},
    {"value":"INSTITUTIONAL","label":"Institutional"},
    {"value":"MIXED-USE","label":"Mixed Use"}
  ]'::jsonb, true, 1, 'property', NULL),
  ('property_type', 'Property Category', 'select', '[
    {"value":"Houses having area more than 50 sq. yards","label":"House (>50 sq.yds)"},
    {"value":"Houses having area less than 50 sq. yards","label":"House (<50 sq.yds)"},
    {"value":"Commercial shops","label":"Commercial Shops"},
    {"value":"Medium/Large commercial outlets","label":"Medium/Large Commercial"},
    {"value":"Government buildings","label":"Government Buildings"},
    {"value":"Educational institutions","label":"Educational Institutions"},
    {"value":"Hospital/Clinic","label":"Hospital/Clinic"},
    {"value":"Industrial Unit","label":"Industrial Unit"}
  ]'::jsonb, true, 2, 'property', NULL),
  ('property_sub_type', 'Sub-Type', 'select', '[
    {"value":"Independent House","label":"Independent House"},
    {"value":"Apartment/Flats","label":"Apartment/Flats"},
    {"value":"Row House","label":"Row House"},
    {"value":"Office","label":"Office"},
    {"value":"Retail Shop","label":"Retail Shop"},
    {"value":"Restaurant","label":"Restaurant"},
    {"value":"Hospital/Clinic","label":"Hospital/Clinic"},
    {"value":"School/College","label":"School/College"}
  ]'::jsonb, false, 3, 'property', NULL),
  ('house_no',       'House/Plot Number',     'text',     NULL, true,  4,  'property', 'e.g. A-101'),
  ('floor',          'Floor',                 'text',     NULL, false, 5,  'property', 'e.g. Ground, First'),
  ('num_floors',     'Number of Floors',      'number',   NULL, false, 6,  'property', '1'),
  ('num_flats',      'Number of Flats/Units', 'number',   NULL, false, 7,  'property', '1'),
  ('family_members', 'Family Members',        'number',   NULL, false, 8,  'property', 'Total members'),
  ('bin_type', 'Bin Type', 'select', '[
    {"value":"10L","label":"10 Litre"},
    {"value":"20L","label":"20 Litre"},
    {"value":"50L","label":"50 Litre"},
    {"value":"100L","label":"100 Litre"},
    {"value":"Bulk","label":"Bulk Container"}
  ]'::jsonb, false, 9, 'property', NULL),
  ('waste_category', 'Waste Category', 'select', '[
    {"value":"household","label":"Household"},
    {"value":"commercial","label":"Commercial"},
    {"value":"biomedical","label":"Biomedical"},
    {"value":"construction","label":"Construction & Demolition"},
    {"value":"horticultural","label":"Horticultural"}
  ]'::jsonb, false, 10, 'property', NULL),
  ('colony_name', 'Colony/Locality',  'text',     NULL, false, 1, 'location', 'e.g. Brahampuri'),
  ('plot_no',     'Plot No',          'text',     NULL, false, 2, 'location', 'e.g. 12'),
  ('address',     'Full Address',     'textarea', NULL, true,  3, 'location', 'Door No, Street, Colony'),
  ('landmark',    'Landmark',         'text',     NULL, false, 4, 'location', 'Near temple, school, etc.'),
  ('pin_code',    'PIN Code',         'text',     NULL, false, 5, 'location', '302001'),
  ('owner_first_name',  'First Name',    'text', NULL, true,  1, 'contact', 'First name of owner'),
  ('owner_middle_name', 'Middle Name',   'text', NULL, false, 2, 'contact', '(optional)'),
  ('owner_last_name',   'Last Name',     'text', NULL, true,  3, 'contact', 'Last name of owner'),
  ('mobile_number',     'Mobile Number', 'text', NULL, true,  4, 'contact', '10-digit mobile number'),
  ('email',             'Email',         'text', NULL, false, 5, 'contact', 'owner@email.com'),
  ('aadhaar',           'Aadhaar Number','text', NULL, false, 6, 'contact', 'XXXX-XXXX-XXXX'),
  ('monthly_charge', 'Monthly Charge (Rs)', 'number',   NULL, true,  1, 'financial', 'e.g. 500'),
  ('remarks',        'Remarks',            'textarea', NULL, false, 2, 'financial', 'Any additional notes')
ON CONFLICT (field_key) DO NOTHING;

