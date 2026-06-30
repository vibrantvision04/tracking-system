-- Migration 057: Alert persistence (unified vehicle-alert feed + per-user read state)
-- Backs the unified Vehicle_Alert feed served by the mobile handlers
-- (MobileMyAlerts / MobileWardAlerts / MobileZoneAlerts) and the per-user
-- read-state used by POST /api/mobile/alerts/{id}/read.
--
-- Idempotent: ALL files in migrations/ run in sorted order on every startup
-- (scripts/migrate_all.go), so every object uses IF NOT EXISTS.
--
-- Design: "New persistence (alerts)". Requirements: 8.9, 8.10.
--
-- Notes:
--  * Automatic alerts already live in the `alerts` table (migration 013).
--    `vehicle_alerts` backs MANUAL alerts (and, if ever needed, persisted
--    automatic alerts) so the unified feed can combine both sources.
--  * The unified feed exposes string ids (e.g. "auto-123" / "manual-45"),
--    therefore `alert_reads.alert_id` is TEXT and the read-state key is the
--    composite (user_id, alert_id) — read state is per user, per feed item,
--    independent of which source produced the alert.

-- 1. Per-user read state for the unified alert feed
CREATE TABLE IF NOT EXISTS alert_reads (
    user_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    alert_id  TEXT NOT NULL,
    read_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, alert_id)
);

CREATE INDEX IF NOT EXISTS idx_alert_reads_user ON alert_reads (user_id);

-- 2. Manual (and optionally persisted automatic) alerts backing the unified feed
CREATE TABLE IF NOT EXISTS vehicle_alerts (
    id             BIGSERIAL PRIMARY KEY,
    type           TEXT NOT NULL,
    source         TEXT NOT NULL DEFAULT 'manual', -- 'automatic' | 'manual'
    message        TEXT NOT NULL DEFAULT '',
    severity       TEXT NOT NULL DEFAULT 'minor',
    vehicle_id     INT,
    recipient_role TEXT,
    recipient_id   INT,
    sender_role    TEXT,
    sender_user_id INT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Constrain source to the known values (added defensively, ignore if present)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_alerts_source_check'
    ) THEN
        ALTER TABLE vehicle_alerts
            ADD CONSTRAINT vehicle_alerts_source_check
            CHECK (source IN ('automatic', 'manual'));
    END IF;
END $$;

-- Indexes for the common scoped lookups (recipient, vehicle, recency)
CREATE INDEX IF NOT EXISTS idx_vehicle_alerts_recipient ON vehicle_alerts (recipient_role, recipient_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_alerts_vehicle ON vehicle_alerts (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_alerts_created_at ON vehicle_alerts (created_at DESC);
