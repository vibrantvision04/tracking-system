-- 066_rename_swift_tables_to_swift.sql
-- Rename the tables to match the Swift branding

DO $$
BEGIN
    -- 1. Rename route_types_swift to route_types_swift
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'route_types_swift') THEN
        ALTER TABLE route_types_swift RENAME TO route_types_swift;
    END IF;

    -- Rename the primary key constraint and sequence if they exist
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'route_types_swift_id_seq') THEN
        ALTER SEQUENCE route_types_swift_id_seq RENAME TO route_types_swift_id_seq;
    END IF;

    -- 2. Rename vehicle_types_swift to vehicle_types_swift
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vehicle_types_swift') THEN
        ALTER TABLE vehicle_types_swift RENAME TO vehicle_types_swift;
    END IF;

    -- Rename the primary key constraint and sequence if they exist
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'vehicle_types_swift_id_seq') THEN
        ALTER SEQUENCE vehicle_types_swift_id_seq RENAME TO vehicle_types_swift_id_seq;
    END IF;
END
$$;
