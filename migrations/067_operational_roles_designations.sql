-- Migration 067: Distinct operational (mobile-app) roles + matching designations
-- Creates the per-type RBAC roles used by the employee creation form and the
-- mobile app. These are SYSTEM roles (is_system = true) so they can't be
-- deleted/renamed from the RBAC admin UI.
--
-- Geographic scope:
--   Zone Manager        -> 'zone' (single zone per manager)
--   Supervisor          -> 'ward' (multiple wards)
--   Driver / Open Depot Operator / Road Sweeper -> 'none'
--
-- (roles.name has no UNIQUE constraint, so inserts are guarded with NOT EXISTS)

-- 1. Operational system roles ---------------------------------------------
INSERT INTO roles (name, description, is_system, scope_type)
SELECT 'Driver', 'Mobile driver — vehicle operations', true, 'none'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE LOWER(name) = 'driver');

INSERT INTO roles (name, description, is_system, scope_type)
SELECT 'Zone Manager', 'Manages a single assigned zone', true, 'zone'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE LOWER(name) = 'zone manager');

INSERT INTO roles (name, description, is_system, scope_type)
SELECT 'Open Depot Operator', 'Open depot cleaning operator (mobile)', true, 'none'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE LOWER(name) = 'open depot operator');

INSERT INTO roles (name, description, is_system, scope_type)
SELECT 'Road Sweeper', 'Road sweeping staff (mobile)', true, 'none'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE LOWER(name) = 'road sweeper');

-- Supervisor already exists from migration 055 — promote it to a system role.

-- 2. Normalise flags & scope for all operational roles (idempotent) -------
UPDATE roles SET is_system = true
 WHERE LOWER(name) IN ('driver', 'supervisor', 'zone manager',
                       'open depot operator', 'road sweeper');

UPDATE roles SET scope_type = 'zone' WHERE LOWER(name) = 'zone manager';
UPDATE roles SET scope_type = 'ward' WHERE LOWER(name) = 'supervisor';
UPDATE roles SET scope_type = 'none'
 WHERE LOWER(name) IN ('driver', 'open depot operator', 'road sweeper');

-- 3. Matching designations (designations.name is UNIQUE) ------------------
INSERT INTO designations (name) VALUES
  ('Supervisor'),
  ('Zone Manager'),
  ('Open Depot Operator'),
  ('Road Sweeper')
ON CONFLICT (name) DO NOTHING;
