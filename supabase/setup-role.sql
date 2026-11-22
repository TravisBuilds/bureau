-- Bureau App Role Setup
-- Run this ONCE in your Supabase SQL Editor to create the bureau_app role
-- Replace YOUR_SECURE_PASSWORD with a strong password and store it securely

-- Create the role if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bureau_app') THEN
    CREATE ROLE bureau_app WITH LOGIN PASSWORD 'YOUR_SECURE_PASSWORD';
    RAISE NOTICE 'Created bureau_app role';
  ELSE
    RAISE NOTICE 'bureau_app role already exists';
  END IF;
END
$$;

-- Grant connection privileges
GRANT CONNECT ON DATABASE postgres TO bureau_app;

-- Note: Run migration 20261122000005_create_app_role.sql to grant schema privileges
-- The migration handles all GRANT statements so they apply to future tables too
