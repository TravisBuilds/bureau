-- Setup test database with Supabase auth schema stubs
-- This creates minimal auth schema/functions needed for bureau migrations

-- Create auth schema (Supabase auth system stub)
CREATE SCHEMA IF NOT EXISTS auth;

-- Auth users table (minimal stub)
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stub auth.uid() function - returns current user from request.jwt.claim.sub
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- Stub auth.jwt() function - returns JWT claims
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true),
    '{}'
  )::jsonb;
$$;

-- Create extensions schema (for uuid generation)
CREATE SCHEMA IF NOT EXISTS extensions;

-- Install pgcrypto extension for uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Grant basic access to bureau_app
GRANT USAGE ON SCHEMA auth TO bureau_app;
GRANT SELECT ON auth.users TO bureau_app;
GRANT USAGE ON SCHEMA extensions TO bureau_app;

COMMENT ON SCHEMA auth IS 'Stub Supabase auth schema for testing';
COMMENT ON FUNCTION auth.uid() IS 'Returns current user ID from JWT claims (transaction-local)';
