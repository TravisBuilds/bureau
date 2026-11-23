-- Test Database Setup: Stub auth/extensions for local Postgres
-- Bureau uses Supabase auth.users and pgcrypto from extensions schema

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;

-- Stub auth.users table
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stub auth.uid() function (returns current_setting or NULL)
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- Stub auth.set_user() for compatibility
CREATE OR REPLACE FUNCTION auth.set_user(user_id UUID)
RETURNS VOID
LANGUAGE sql
AS $$
  SELECT set_config('request.jwt.claim.sub', user_id::text, false);
$$;

-- Install pgcrypto extension for digest() function
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Install uuid-ossp for uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

COMMENT ON SCHEMA auth IS 'Stubbed Supabase auth schema for local tests';
COMMENT ON SCHEMA extensions IS 'Postgres extensions (pgcrypto, uuid-ossp)';
