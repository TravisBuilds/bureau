-- Test database setup (NOT for production migrations)
-- Creates auth schema stubs for local testing only

-- Create schemas
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;

-- Create roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;

-- Grant to bureau_app for testing only
GRANT anon, authenticated TO bureau_app;

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- Minimal auth.users stub
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  encrypted_password TEXT,
  email_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Grant for testing
GRANT SELECT, INSERT, DELETE ON auth.users TO bureau_app;

-- Disable RLS for testing
ALTER TABLE auth.users DISABLE ROW LEVEL SECURITY;

-- Test helper to set user context
CREATE OR REPLACE FUNCTION auth.set_test_user(user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', user_id::text)::text, false);
END;
$$;

-- Stub auth.uid()
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
$$;
