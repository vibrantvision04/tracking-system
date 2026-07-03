-- Migration 068: Fix Employee Users Email
-- Updates any existing user records in the 'users' table whose email matches an employee's personal email
-- to use the derived login email format (employee_id@swift.com) instead.
-- Handles duplicate user records (created during employee updates) by retaining the password hash.

DO $$
DECLARE
    rec RECORD;
    personal_user_id INT;
    login_user_id INT;
    personal_password TEXT;
    login_password TEXT;
    target_email TEXT;
BEGIN
    FOR rec IN 
        SELECT id, employee_id, email 
        FROM employees
    LOOP
        target_email := LOWER(rec.employee_id) || '@swift.com';
        
        -- Find user with personal email
        personal_user_id := NULL;
        personal_password := NULL;
        IF rec.email IS NOT NULL AND rec.email <> '' AND rec.email NOT LIKE '%@swift.com' THEN
            SELECT id, password_hash INTO personal_user_id, personal_password
            FROM users 
            WHERE email = rec.email;
        END IF;
        
        -- Find user with target login email
        login_user_id := NULL;
        login_password := NULL;
        SELECT id, password_hash INTO login_user_id, login_password
        FROM users
        WHERE email = target_email;
        
        -- Resolve duplicates or migrate
        IF personal_user_id IS NOT NULL AND login_user_id IS NOT NULL THEN
            -- Both exist!
            IF (login_password IS NULL OR login_password = '') THEN
                -- The duplicate login_user has no password, but the personal_user does.
                -- We delete the duplicate login_user so we can rename the personal_user.
                DELETE FROM user_roles WHERE user_id = login_user_id;
                DELETE FROM users WHERE id = login_user_id;
                UPDATE users SET email = target_email WHERE id = personal_user_id;
            ELSE
                -- The login_user already has a valid password. We just delete the personal_user.
                DELETE FROM user_roles WHERE user_id = personal_user_id;
                DELETE FROM users WHERE id = personal_user_id;
            END IF;
        ELSIF personal_user_id IS NOT NULL AND login_user_id IS NULL THEN
            -- Only personal email user exists. We rename it to the target login email.
            UPDATE users SET email = target_email WHERE id = personal_user_id;
        END IF;
    END LOOP;
END $$;
