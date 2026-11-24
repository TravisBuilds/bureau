-- Fix user_workspaces() to be zero-arg only with removed_at filter
-- Date: 2026-11-24
-- Purpose: Replace single implementation, drop uuid overload

SET search_path TO bureau, extensions;

-- Drop the uuid overload from 000004 if it exists
DROP FUNCTION IF EXISTS bureau.user_workspaces(UUID);

-- Create or replace zero-arg version
CREATE OR REPLACE FUNCTION bureau.user_workspaces()
RETURNS TABLE(workspace_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
  SELECT workspace_id
  FROM bureau.workspace_members
  WHERE user_id = auth.uid() AND removed_at IS NULL;
$$;

COMMENT ON FUNCTION bureau.user_workspaces IS 'Returns workspaces for current user (active members only)';

REVOKE ALL ON FUNCTION bureau.user_workspaces FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION bureau.user_workspaces TO bureau_app;
