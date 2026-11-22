-- Create bureau_app role for application connections
-- Password must be supplied at runtime (not committed to git)
-- 
-- To create the role with password:
-- CREATE ROLE bureau_app WITH LOGIN PASSWORD 'your-secure-password-here';
--
-- This migration grants privileges but doesn't create the role with password

-- Grant usage on schemas
GRANT USAGE ON SCHEMA bureau TO bureau_app;
GRANT USAGE ON SCHEMA extensions TO bureau_app;

-- Grant table privileges on all current and future tables in bureau schema
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA bureau TO bureau_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA bureau GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bureau_app;

-- Grant sequence privileges for auto-increment IDs
GRANT USAGE ON ALL SEQUENCES IN SCHEMA bureau TO bureau_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA bureau GRANT USAGE ON SEQUENCES TO bureau_app;

-- Grant function execution privileges
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA bureau TO bureau_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA bureau GRANT EXECUTE ON FUNCTIONS TO bureau_app;

-- Set default search_path for bureau_app role
ALTER ROLE bureau_app SET search_path = bureau, extensions;

-- Note: RLS policies will still apply to bureau_app connections
-- The role needs SELECT on auth.users for FK checks but cannot write to it
GRANT SELECT ON auth.users TO bureau_app;

COMMENT ON ROLE bureau_app IS 'Application role for Bureau app connections. Has full access to bureau schema only, cannot write to auth.* or public.*. RLS policies still apply.';
