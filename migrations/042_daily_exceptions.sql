-- 042 Daily Exceptions
-- Captures manual overrides that currently exist only inside the Excel workbook
-- (GPS TAMPERED, NOT WORKED, NETWORK ISSUE, REPLACED BY XXXX, etc.)
-- These are entered by operators and appear as remarks in the generated report.

DO $$ BEGIN
    CREATE TYPE exception_type_enum AS ENUM (
        'GPS_TAMPERED',
        'NOT_WORKED',
        'NETWORK_ISSUE',
        'VEHICLE_BREAKDOWN',
        'REPLACED',
        'OTHER'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS daily_exceptions (
    id                  SERIAL PRIMARY KEY,
    report_date         DATE NOT NULL,
    vehicle_reg_no      TEXT NOT NULL,
    exception_type      exception_type_enum NOT NULL,
    replacement_vehicle TEXT,               -- used when exception_type = 'REPLACED'
    remarks             TEXT,               -- free-text override (shown in Remarks column)
    created_by          TEXT,               -- operator username
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(report_date, vehicle_reg_no)     -- one exception entry per vehicle per day
);

CREATE INDEX IF NOT EXISTS idx_daily_exceptions_date ON daily_exceptions(report_date);
CREATE INDEX IF NOT EXISTS idx_daily_exceptions_reg  ON daily_exceptions(vehicle_reg_no);
