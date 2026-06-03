-- 014_route_types.sql
-- Creates a managed route_types table and links it to the routes table.

-- 1. Create the route_types table
CREATE TABLE IF NOT EXISTS route_types_iswm (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    is_active  BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Seed default route types (safe, will not duplicate on re-run)
INSERT INTO route_types_iswm (id, name, is_active) VALUES
  (1, 'D2D',        true),
  (2, 'SWEEPING',   true),
  (3, 'DUSTBIN',    true),
  (4, 'COMMERCIAL', true)
ON CONFLICT (name) DO NOTHING;

-- 3. Reset the serial sequence so new rows start after the seeded IDs
SELECT setval('route_types_iswm_id_seq', (SELECT MAX(id) FROM route_types_iswm));

-- 4. Ensure routes.route_type_id rows that are NULL or 0 fall back to 1 (D2D)
UPDATE routes SET route_type_id = 1 WHERE route_type_id IS NULL OR route_type_id = 0;

-- 5. Add the FK constraint (idempotent: check first to avoid duplicate constraint error)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_routes_route_type'
      AND table_name = 'routes'
  ) THEN
    ALTER TABLE routes
      ADD CONSTRAINT fk_routes_route_type
      FOREIGN KEY (route_type_id)
      REFERENCES route_types_iswm(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;
