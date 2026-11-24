-- Minimal Supabase-like setup for local testing
-- Creates auth schema, roles, and minimal stubs

-- Create schemas
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;

-- Create roles if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;

-- Grant bureau_app the necessary group roles
GRANT anon TO bureau_app;
GRANT authenticated TO bureau_app;

-- Create uuid extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- Minimal auth.users table stub
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  encrypted_password TEXT,
  email_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Grant SELECT on auth.users to postgres (for SECURITY DEFINER functions)
-- Never grant to bureau_app
GRANT SELECT ON auth.users TO postgres;

-- Enable RLS on auth.users (no policies = no access)
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

-- Helper function to set current user (for testing)
CREATE OR REPLACE FUNCTION auth.set_test_user(user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', user_id::text)::text, false);
END;
$$;

-- Helper function to get current user
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
$$;

COMMENT ON SCHEMA auth IS 'Minimal Supabase auth schema for testing';
COMMENT ON TABLE auth.users IS 'Stub users table for testing';
