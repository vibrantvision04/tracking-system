-- Add dump zone, entry, and exit points configuration columns to transfer_stations table
ALTER TABLE transfer_stations ADD COLUMN IF NOT EXISTS dump_zone_latitude DOUBLE PRECISION;
ALTER TABLE transfer_stations ADD COLUMN IF NOT EXISTS dump_zone_longitude DOUBLE PRECISION;
ALTER TABLE transfer_stations ADD COLUMN IF NOT EXISTS dump_zone_radius DOUBLE PRECISION;

ALTER TABLE transfer_stations ADD COLUMN IF NOT EXISTS entry_latitude DOUBLE PRECISION;
ALTER TABLE transfer_stations ADD COLUMN IF NOT EXISTS entry_longitude DOUBLE PRECISION;

ALTER TABLE transfer_stations ADD COLUMN IF NOT EXISTS exit_latitude DOUBLE PRECISION;
ALTER TABLE transfer_stations ADD COLUMN IF NOT EXISTS exit_longitude DOUBLE PRECISION;
