-- Migration 055: RBAC (Role-Based Access Control) System
-- Enables dynamic role & permission management from admin dashboard

-- 1. Roles table
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT DEFAULT '',
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Permission categories (for UI organization)
CREATE TABLE IF NOT EXISTS permission_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Permissions
CREATE TABLE IF NOT EXISTS permissions (
    id SERIAL PRIMARY KEY,
    category_id INT REFERENCES permission_categories(id) ON DELETE SET NULL,
    code VARCHAR(100) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT DEFAULT '',
    module VARCHAR(100) NOT NULL DEFAULT '',
    permission_type VARCHAR(50) NOT NULL DEFAULT 'action',
    is_menu BOOLEAN DEFAULT false,
    menu_path VARCHAR(500) DEFAULT '',
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(code)
);

-- 4. Role-Permission assignments
CREATE TABLE IF NOT EXISTS role_permissions (
    id SERIAL PRIMARY KEY,
    role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    is_granted BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role_id, permission_id)
);

-- 5. User-Role assignments (one role per user)
CREATE TABLE IF NOT EXISTS user_roles (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Seed default roles
INSERT INTO roles (name, description, is_system) VALUES
    ('Super Admin', 'Unrestricted system access', true),
    ('Admin', 'Full administrative access', true),
    ('Manager', 'Operational management access', false),
    ('Supervisor', 'Field supervision access', false),
    ('Viewer', 'Read-only access', false)
ON CONFLICT DO NOTHING;

-- Seed permission categories
INSERT INTO permission_categories (name, display_order) VALUES
    ('Dashboard', 1),
    ('Vehicles', 2),
    ('Employees', 3),
    ('Routes', 4),
    ('Reports', 5),
    ('Attendance', 6),
    ('Approvals', 7),
    ('Transfer Stations', 8),
    ('Open Depots', 9),
    ('RFID', 10),
    ('Playback', 11),
    ('Tracking', 12),
    ('Settings', 13),
    ('Users', 14),
    ('System', 15),
    ('Mobile', 16)
ON CONFLICT DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_perm ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_permissions_category ON permissions(category_id);
CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module);
