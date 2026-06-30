-- 064_road_sweeping_module.sql
-- Road Sweeping Staff module: new tables and schema extensions.
-- Idempotent: re-running is a no-op (IF NOT EXISTS throughout).

BEGIN;

-- ============================================================
-- 1. Extend mobile_attendance with sweeping-specific metadata
-- ============================================================
ALTER TABLE mobile_attendance
    ADD COLUMN IF NOT EXISTS face_match_confidence     NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS device_id                 VARCHAR(100),
    ADD COLUMN IF NOT EXISTS device_battery_punch_in   INT,
    ADD COLUMN IF NOT EXISTS gps_accuracy_punch_in     NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS network_type_punch_in     VARCHAR(20),
    ADD COLUMN IF NOT EXISTS is_supervisor_override    BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS override_by_user_id       INT,
    ADD COLUMN IF NOT EXISTS ward_id_override          INT REFERENCES regions(id) ON DELETE SET NULL;

-- ============================================================
-- 2. Sweeping Routes (ward-based, polyline + Point A/B in JSONB)
-- ============================================================
CREATE TABLE IF NOT EXISTS sweeping_routes (
    id              SERIAL PRIMARY KEY,
    route_code      VARCHAR(50) UNIQUE NOT NULL,
    ward_id         INT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    polyline        JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{lat, lng}] ordered
    point_a         JSONB NOT NULL,                      -- {lat, lng}
    point_b         JSONB NOT NULL,                      -- {lat, lng}
    point_a_radius_m INT DEFAULT 20,
    point_b_radius_m INT DEFAULT 20,
    length_m        NUMERIC(10,2),
    direction       VARCHAR(20) DEFAULT 'ONE_WAY',       -- ONE_WAY, TWO_WAY
    status          VARCHAR(20) DEFAULT 'ACTIVE',        -- ACTIVE, INACTIVE, ARCHIVED
    version         INT DEFAULT 1,
    created_by      INT REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sweeping_routes_ward    ON sweeping_routes(ward_id);
CREATE INDEX IF NOT EXISTS idx_sweeping_routes_status  ON sweeping_routes(status);
CREATE INDEX IF NOT EXISTS idx_sweeping_routes_code    ON sweeping_routes(route_code);

-- ============================================================
-- 3. Sweeping Assignments (employee → route on a date/shift)
-- ============================================================
CREATE TABLE IF NOT EXISTS sweeping_assignments (
    id              SERIAL PRIMARY KEY,
    employee_id     INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    route_id        INT NOT NULL REFERENCES sweeping_routes(id) ON DELETE CASCADE,
    ward_id         INT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    valid_from      DATE NOT NULL,
    valid_to        DATE,
    is_active       BOOLEAN DEFAULT true,
    created_by      INT REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, route_id, valid_from)
);

CREATE INDEX IF NOT EXISTS idx_sweeping_assignments_emp   ON sweeping_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_sweeping_assignments_route ON sweeping_assignments(route_id);
CREATE INDEX IF NOT EXISTS idx_sweeping_assignments_ward  ON sweeping_assignments(ward_id);
CREATE INDEX IF NOT EXISTS idx_sweeping_assignments_active ON sweeping_assignments(is_active);

-- ============================================================
-- 4. Cleaning Tasks (before/after images with coverage + approval)
-- ============================================================
CREATE TABLE IF NOT EXISTS cleaning_tasks (
    id                  SERIAL PRIMARY KEY,
    employee_id         INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    route_id            INT NOT NULL REFERENCES sweeping_routes(id) ON DELETE CASCADE,
    attendance_id       UUID REFERENCES mobile_attendance(id) ON DELETE SET NULL,
    before_image_url    TEXT NOT NULL,
    before_lat          NUMERIC(10,8) NOT NULL,
    before_lng          NUMERIC(11,8) NOT NULL,
    before_timestamp    TIMESTAMPTZ NOT NULL,
    after_image_url     TEXT,
    after_lat           NUMERIC(10,8),
    after_lng           NUMERIC(11,8),
    after_timestamp     TIMESTAMPTZ,
    coverage_pct        NUMERIC(5,2) DEFAULT 0,
    covered_segments    INT DEFAULT 0,
    total_segments      INT DEFAULT 0,
    approval_status     VARCHAR(20) DEFAULT 'PENDING',   -- PENDING, APPROVED, REJECTED
    reviewed_by         INT REFERENCES users(id),
    rejection_reason    TEXT,
    reviewed_at         TIMESTAMPTZ,
    operational_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_emp     ON cleaning_tasks(employee_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_route   ON cleaning_tasks(route_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_status  ON cleaning_tasks(approval_status);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_date    ON cleaning_tasks(operational_date);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_att     ON cleaning_tasks(attendance_id);

-- ============================================================
-- 5. Sweeping GPS trail (8-second interval pings)
-- ============================================================
CREATE TABLE IF NOT EXISTS sweeping_gps_logs (
    id              BIGSERIAL PRIMARY KEY,
    employee_id     INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    route_id        INT NOT NULL REFERENCES sweeping_routes(id) ON DELETE CASCADE,
    lat             DOUBLE PRECISION NOT NULL,
    lng             DOUBLE PRECISION NOT NULL,
    speed_kmh       NUMERIC(5,2) DEFAULT 0,
    captured_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sweeping_gps_emp_route ON sweeping_gps_logs(employee_id, route_id);
CREATE INDEX IF NOT EXISTS idx_sweeping_gps_captured   ON sweeping_gps_logs(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_sweeping_gps_cleanup    ON sweeping_gps_logs(created_at);

-- Periodic cleanup: keep last 7 days of GPS logs
-- (separate cron or trigger handles the actual deletion)

COMMIT;
