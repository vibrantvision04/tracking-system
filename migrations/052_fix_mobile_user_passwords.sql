-- 052_fix_mobile_user_passwords.sql
-- Replace dummy password hashes with real bcrypt hashes for "123456"
-- so mobile users can log in with their employee ID / phone + password "123456"

UPDATE users SET password_hash = '$2a$10$lekhl9swi8A83..IWrQzN.90qmqtvKj4eR40.FCcjD.EdG6CdTIYm'
WHERE password_hash = 'pbkdf2_sha256$260000$default_salt$dummy_hash'
  AND email LIKE '%@jaipurheritage.swm';

-- Create a test mobile user if not exists (for easy testing)
INSERT INTO users (email, role, password_hash)
SELECT 'test-mobile@example.com', 'City Administrator', '$2a$10$lekhl9swi8A83..IWrQzN.90qmqtvKj4eR40.FCcjD.EdG6CdTIYm'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'test-mobile@example.com');
