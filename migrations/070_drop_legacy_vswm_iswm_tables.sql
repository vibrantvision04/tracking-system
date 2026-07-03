-- Migration 070: Drop Legacy VSWM and ISWM Tables
-- Cleans up obsolete tables from before the SWIFT rebranding to keep the database schema clean and correct.

DROP TABLE IF EXISTS route_types_vswm CASCADE;
DROP TABLE IF EXISTS route_types_iswm CASCADE;
DROP TABLE IF EXISTS vehicle_types_vswm CASCADE;
DROP TABLE IF EXISTS vehicle_types_iswm CASCADE;
