-- Fix user_workspaces() to exclude removed members
-- Date: 2026-11-24
-- Purpose: Idempotent migration to fix RLS - removed members must not see workspace

SET search_path TO bureau, extensions;

-- Drop and recreate user_workspaces to exclude removed_at IS NOT NULL
CREATE OR REPLACE FUNCTION bureau.user_workspaces(user_uuid UUID)
RETURNS TABLE(workspace_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
  SELECT workspace_id
  FROM bureau.workspace_members
  WHERE user_id = user_uuid AND removed_at IS NULL;
$$;

COMMENT ON FUNCTION bureau.user_workspaces(UUID) IS 'Returns workspaces for active (not removed) members only';

REVOKE ALL ON FUNCTION bureau.user_workspaces(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION bureau.user_workspaces(UUID) TO bureau_app;
