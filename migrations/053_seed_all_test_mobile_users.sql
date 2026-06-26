-- Migration 053: Seed test mobile users for all designations
-- Login with the phone number shown below, password: "123456"
-- bcrypt hash: $2a$10$lekhl9swi8A83..IWrQzN.90qmqtvKj4eR40.FCcjD.EdG6CdTIYm

-- Zone Manager: login with 111111111111
INSERT INTO users (email, role, password_hash)
SELECT '111111111111@jaipurheritage.swm', 'City Administrator', '$2a$10$lekhl9swi8A83..IWrQzN.90qmqtvKj4eR40.FCcjD.EdG6CdTIYm'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = '111111111111@jaipurheritage.swm');

-- Supervisor: login with 222222222222
INSERT INTO users (email, role, password_hash)
SELECT '222222222222@jaipurheritage.swm', 'CSI', '$2a$10$lekhl9swi8A83..IWrQzN.90qmqtvKj4eR40.FCcjD.EdG6CdTIYm'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = '222222222222@jaipurheritage.swm');

-- Driver: login with 333333333333
INSERT INTO users (email, role, password_hash)
SELECT '333333333333@jaipurheritage.swm', 'Driver', '$2a$10$lekhl9swi8A83..IWrQzN.90qmqtvKj4eR40.FCcjD.EdG6CdTIYm'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = '333333333333@jaipurheritage.swm');

-- Operator: login with 444444444444
INSERT INTO users (email, role, password_hash)
SELECT '444444444444@jaipurheritage.swm', 'Operator', '$2a$10$lekhl9swi8A83..IWrQzN.90qmqtvKj4eR40.FCcjD.EdG6CdTIYm'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = '444444444444@jaipurheritage.swm');

-- Open Depot Operator: login with 555555555555
INSERT INTO users (email, role, password_hash)
SELECT '555555555555@jaipurheritage.swm', 'open_depot_operator', '$2a$10$lekhl9swi8A83..IWrQzN.90qmqtvKj4eR40.FCcjD.EdG6CdTIYm'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = '555555555555@jaipurheritage.swm');
