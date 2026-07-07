-- Migration 069: Rename VSWM Tables to Swift Correctly
-- Corrects the legacy find-and-replace issue from migration 066.

DO $$
BEGIN
    -- 1. Rename route_types_vswm to route_types_swift
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'route_types_vswm')
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'route_types_swift') THEN
        ALTER TABLE route_types_vswm RENAME TO route_types_swift;
    END IF;

    -- Rename the sequence if it exists and target doesn't exist
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'route_types_vswm_id_seq')
       AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'route_types_swift_id_seq') THEN
        ALTER SEQUENCE route_types_vswm_id_seq RENAME TO route_types_swift_id_seq;
    END IF;

    -- 2. Rename vehicle_types_vswm to vehicle_types_swift
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vehicle_types_vswm')
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vehicle_types_swift') THEN
        ALTER TABLE vehicle_types_vswm RENAME TO vehicle_types_swift;
    END IF;

    -- Rename the sequence if it exists and target doesn't exist
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'vehicle_types_vswm_id_seq')
       AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'vehicle_types_swift_id_seq') THEN
        ALTER SEQUENCE vehicle_types_vswm_id_seq RENAME TO vehicle_types_swift_id_seq;
    END IF;
END
$$;
