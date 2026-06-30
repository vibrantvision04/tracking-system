-- Migration 060: Unified Employee Management
-- Adds scope_type to roles, status to employees, creates employee_scopes table,
-- populates employee_scopes from existing data, and migrates users.role text to user_roles FK.

-- 1. Add scope_type to roles
ALTER TABLE roles ADD COLUMN IF NOT EXISTS scope_type VARCHAR(10) DEFAULT 'none'
    CHECK (scope_type IN ('none', 'zone', 'ward'));
UPDATE roles SET scope_type = 'zone' WHERE LOWER(name) LIKE '%zone%manager%';
UPDATE roles SET scope_type = 'ward' WHERE LOWER(name) = 'supervisor';

-- 2. Add status to employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived'));
UPDATE employees SET status = CASE WHEN COALESCE(is_active, true) = false THEN 'inactive' ELSE 'active' END;

-- 3. Create employee_scopes
CREATE TABLE IF NOT EXISTS employee_scopes (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    scope_type VARCHAR(10) NOT NULL CHECK (scope_type IN ('zone', 'ward')),
    region_id INTEGER NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(employee_id, region_id)
);
CREATE INDEX IF NOT EXISTS idx_employee_scopes_employee ON employee_scopes(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_scopes_region ON employee_scopes(region_id);

-- 4. Populate employee_scopes from existing employee_department_designations
INSERT INTO employee_scopes (employee_id, scope_type, region_id)
SELECT
    edd.employee_id,
    CASE WHEN r.region_type_id = 2 THEN 'zone' ELSE 'ward' END,
    edd.region_id
FROM employee_department_designations edd
JOIN regions r ON edd.region_id = r.id
WHERE edd.region_id IS NOT NULL
ON CONFLICT (employee_id, region_id) DO NOTHING;

-- 5. Migrate users.role text → user_roles FK (where not already present)
-- Log conflicts to stdout: when users.role disagrees with existing user_roles entry
DO $$
DECLARE
    conflict_rec RECORD;
BEGIN
    -- Log conflicts where users.role disagrees with user_roles
    FOR conflict_rec IN
        SELECT u.id AS user_id, u.email, u.role AS users_role_text,
               r.name AS user_roles_role_name
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.id
        JOIN roles r ON r.id = ur.role_id
        WHERE u.role IS NOT NULL AND u.role <> ''
          AND LOWER(u.role) <> LOWER(r.name)
    LOOP
        RAISE NOTICE 'CONFLICT: user_id=%, email=%, users.role="%", user_roles.role="%". Preferring user_roles entry.',
            conflict_rec.user_id, conflict_rec.email,
            conflict_rec.users_role_text, conflict_rec.user_roles_role_name;
    END LOOP;

    -- Insert role mappings for users that do NOT already have a user_roles entry
    INSERT INTO user_roles (user_id, role_id)
    SELECT u.id, r.id
    FROM users u
    JOIN roles r ON LOWER(r.name) = LOWER(u.role)
    WHERE NOT EXISTS (
        SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id
    )
    AND u.role IS NOT NULL AND u.role <> '';
END $$;
