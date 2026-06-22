-- Seed employee profiles for all mock users in users table
INSERT INTO employees (first_name, last_name, employee_id, aadhaar_no, contact_no, address)
SELECT 
    UPPER(split_part(email, '@', 1)) as first_name,
    'MOCK' as last_name,
    split_part(email, '@', 1) as employee_id,
    split_part(email, '@', 1) as aadhaar_no,
    split_part(email, '@', 1) as contact_no,
    'No address available at the moment.' as address
FROM users
WHERE split_part(email, '@', 1) NOT IN (SELECT employee_id FROM employees)
ON CONFLICT (employee_id) DO NOTHING;
