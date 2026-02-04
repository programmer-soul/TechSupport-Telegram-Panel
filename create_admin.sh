#!/bin/bash
# Create admin user in the database

docker exec -i techweb-db-1 psql -U postgres -d support << 'EOF'
-- Check if users table exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users') THEN
        -- Check if admin exists
        IF NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin') THEN
            INSERT INTO users (id, username, telegram_user_id, role, is_active, must_change_password, telegram_oauth_enabled, password_hash, created_at, updated_at)
            VALUES (
                gen_random_uuid(),
                'admin',
                1,
                'administrator',
                true,
                false,
                false,
                '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHRzYWx0$VDvFmyXNRqP6zLqY9bpKZw1kv6r3KJpCzfpSHhP3qEk',
                NOW(),
                NOW()
            );
            RAISE NOTICE 'Admin user created';
        ELSE
            RAISE NOTICE 'Admin user already exists';
        END IF;
    ELSE
        RAISE NOTICE 'Users table does not exist';
    END IF;
END $$;

-- Show all users
SELECT id, username, is_active, role FROM users;
EOF
