-- Migration 071: Drop Obsolete Route Columns
-- Drops corridor_meters, route_direction, and seq_lookahead columns from the routes table.

ALTER TABLE routes DROP COLUMN IF EXISTS corridor_meters;
ALTER TABLE routes DROP COLUMN IF EXISTS route_direction;
ALTER TABLE routes DROP COLUMN IF EXISTS seq_lookahead;
