-- Migration 065: Seed RBAC roles, assign Super Admin to test-admin user,
-- and grant ALL permissions to Super Admin + Admin roles.
--
-- This runs automatically on every deploy via migrate-db so the server
-- always boots with a functional RBAC setup. Idempotent — safe to re-run.

BEGIN;

-- 1. Ensure the two core roles exist
INSERT INTO roles (id, name, description)
VALUES
  (1, 'Super Admin', 'Full system access — bypasses all permission checks'),
  (2, 'Admin', 'Administrative access — all permissions granted explicitly')
ON CONFLICT (id) DO NOTHING;

-- 2. Assign Super Admin role to the bootstrap admin user
--    (test-admin@example.com, created by main.go at boot)
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, 1
FROM users u
WHERE u.email = 'test-admin@example.com'
ON CONFLICT DO NOTHING;

-- 3. Grant ALL existing permissions to both Super Admin (1) and Admin (2) roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.id IN (1, 2)
ON CONFLICT DO NOTHING;

COMMIT;
