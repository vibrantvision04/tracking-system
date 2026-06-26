-- Migration 054: Add approval workflow columns to mobile_open_depot_submissions
-- This enables admin review of Open Depot Worker submissions

ALTER TABLE mobile_open_depot_submissions
  ADD COLUMN IF NOT EXISTS location_validated BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS device_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS app_version VARCHAR(50),
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS remarks TEXT;
