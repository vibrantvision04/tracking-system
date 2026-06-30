-- Migration 061: Deduplicate roles AND permissions tables
-- Both tables were missing UNIQUE constraints on name/code, causing seed inserts
-- to create duplicate rows when migrations ran multiple times.

-- ============================================================
-- PART A: Deduplicate ROLES
-- ============================================================

-- 1. Reassign user_roles FK references from duplicate role IDs to the canonical (lowest ID) entry
UPDATE user_roles
SET role_id = canonical.id
FROM (
    SELECT MIN(id) AS id, name FROM roles GROUP BY name
) canonical
JOIN roles dup ON dup.name = canonical.name AND dup.id != canonical.id
WHERE user_roles.role_id = dup.id;

-- 2. Reassign role_permissions FK references from duplicates to canonical
INSERT INTO role_permissions (role_id, permission_id)
SELECT canonical.id, rp.permission_id
FROM role_permissions rp
JOIN roles dup ON dup.id = rp.role_id
JOIN (SELECT MIN(id) AS id, name FROM roles GROUP BY name) canonical ON canonical.name = dup.name AND dup.id != canonical.id
ON CONFLICT DO NOTHING;

-- Delete role_permissions pointing to duplicate roles
DELETE FROM role_permissions
WHERE role_id IN (
    SELECT dup.id FROM roles dup
    WHERE dup.id NOT IN (SELECT MIN(id) FROM roles GROUP BY name)
);

-- 3. Delete duplicate role rows (keep only the lowest ID per name)
DELETE FROM roles
WHERE id NOT IN (
    SELECT MIN(id) FROM roles GROUP BY name
);

-- 4. Add UNIQUE constraint on name to prevent future duplicates
DO $$ BEGIN
    ALTER TABLE roles ADD CONSTRAINT roles_name_unique UNIQUE (name);
EXCEPTION WHEN duplicate_table THEN NULL;
          WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- PART B: Deduplicate PERMISSIONS
-- ============================================================

-- 1. Reassign role_permissions FK references from duplicate permission IDs to canonical
UPDATE role_permissions
SET permission_id = canonical.id
FROM (
    SELECT MIN(id) AS id, code FROM permissions GROUP BY code
) canonical
JOIN permissions dup ON dup.code = canonical.code AND dup.id != canonical.id
WHERE role_permissions.permission_id = dup.id;

-- Remove any role_permissions that now conflict (same role_id + permission_id)
DELETE FROM role_permissions a
USING role_permissions b
WHERE a.id > b.id
  AND a.role_id = b.role_id
  AND a.permission_id = b.permission_id;

-- 2. Delete duplicate permission rows (keep only the lowest ID per code)
DELETE FROM permissions
WHERE id NOT IN (
    SELECT MIN(id) FROM permissions GROUP BY code
);

-- 3. Add UNIQUE constraint on code to prevent future duplicates (if not already there)
DO $$ BEGIN
    ALTER TABLE permissions ADD CONSTRAINT permissions_code_unique UNIQUE (code);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- ============================================================
-- PART C: Deduplicate PERMISSION_CATEGORIES
-- ============================================================

-- 1. Reassign permissions FK references from duplicate category IDs to canonical
UPDATE permissions
SET category_id = canonical.id
FROM (
    SELECT MIN(id) AS id, name FROM permission_categories GROUP BY name
) canonical
JOIN permission_categories dup ON dup.name = canonical.name AND dup.id != canonical.id
WHERE permissions.category_id = dup.id;

-- 2. Delete duplicate category rows
DELETE FROM permission_categories
WHERE id NOT IN (
    SELECT MIN(id) FROM permission_categories GROUP BY name
);

-- 3. Add UNIQUE constraint on name
DO $$ BEGIN
    ALTER TABLE permission_categories ADD CONSTRAINT permission_categories_name_unique UNIQUE (name);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
