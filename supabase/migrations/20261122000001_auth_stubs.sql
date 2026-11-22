-- Auth schema stubs for local development
-- Mimics Supabase auth.uid() for RLS testing

CREATE SCHEMA IF NOT EXISTS auth;

-- Create a minimal users table for local testing
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  encrypted_password TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Session tracking for local dev
CREATE TABLE IF NOT EXISTS auth.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Current user context (set via SET LOCAL)
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', TRUE), '')::UUID;
$$;

-- Helper function to set current user for testing
CREATE OR REPLACE FUNCTION auth.set_user(user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', user_id::TEXT, FALSE); -- FALSE = session-wide, not transaction-local
END;
$$;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA auth TO postgres, public;
GRANT SELECT ON auth.users TO postgres, public;
GRANT SELECT ON auth.sessions TO postgres, public;
