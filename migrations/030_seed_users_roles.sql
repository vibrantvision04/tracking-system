-- 030_seed_users_roles.sql
-- Seed mock users and roles from system screenshots

INSERT INTO users (email, role, password_hash) VALUES
('8302444497@jaipurheritage.swm', 'Operator', 'pbkdf2_sha256$260000$default_salt$dummy_hash'),
('csi1@jaipurheritage.swm', 'CSI', 'pbkdf2_sha256$260000$default_salt$dummy_hash'),
('9993974596@jaipurheritage.swm', 'Operator', 'pbkdf2_sha256$260000$default_salt$dummy_hash'),
('9983447291@jaipurheritage.swm', 'City Administrator', 'pbkdf2_sha256$260000$default_salt$dummy_hash'),
('9602813998@jaipurheritage.swm', 'City Administrator', 'pbkdf2_sha256$260000$default_salt$dummy_hash'),
('7568873577@jaipurheritage.swm', 'City Administrator', 'pbkdf2_sha256$260000$default_salt$dummy_hash'),
('7610818019@jaipurheritage.swm', 'City Administrator', 'pbkdf2_sha256$260000$default_salt$dummy_hash'),
('9950775558@jaipurheritage.swm', 'City Administrator', 'pbkdf2_sha256$260000$default_salt$dummy_hash'),
('6367276803@jaipurheritage.swm', 'City Administrator', 'pbkdf2_sha256$260000$default_salt$dummy_hash'),
('9928137496@jaipurheritage.swm', 'City Administrator', 'pbkdf2_sha256$260000$default_salt$dummy_hash'),
('8769807155@jaipurheritage.swm', 'City Administrator', 'pbkdf2_sha256$260000$default_salt$dummy_hash'),
('9782788629@jaipurheritage.swm', 'Operator', 'pbkdf2_sha256$260000$default_salt$dummy_hash'),
('6375831832@jaipurheritage.swm', 'Operator', 'pbkdf2_sha256$260000$default_salt$dummy_hash'),
('9351454493@jaipurheritage.swm', 'Operator', 'pbkdf2_sha256$260000$default_salt$dummy_hash'),
('9928059453@jaipurheritage.swm', 'Operator', 'pbkdf2_sha256$260000$default_salt$dummy_hash')
ON CONFLICT (email) DO NOTHING;
