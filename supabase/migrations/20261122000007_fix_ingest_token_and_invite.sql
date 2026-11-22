-- Fix ingest token resolution and add invite enforcement
-- Bug fixes:
-- 1. resolve_ingest_token now returns email (no app access to auth.users needed)
-- 2. RETURNS TABLE instead of OUT params (empty set on miss, not NULL row)
-- 3. Add email field to workspace_members for quick lookup

SET search_path TO bureau, extensions;

-- ============================================================================
-- 1. Add email to workspace_members (for quick user lookup without auth.users)
-- ============================================================================

ALTER TABLE bureau.workspace_members
  ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN bureau.workspace_members.email IS 'User email cached from auth.users for bureau_app access (auth schema is off-limits)';

-- ============================================================================
-- 2. Fix resolve_ingest_token to return email and use RETURNS TABLE
-- ============================================================================

DROP FUNCTION IF EXISTS bureau.resolve_ingest_token(TEXT);

CREATE OR REPLACE FUNCTION bureau.resolve_ingest_token(token_text TEXT)
RETURNS TABLE (
  workspace_id UUID,
  user_id UUID,
  user_email TEXT,
  token_id UUID
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = bureau, extensions
AS $$
  SELECT 
    t.workspace_id,
    w.created_by as user_id,
    au.email as user_email,
    t.id as token_id
  FROM bureau.ingest_tokens t
  JOIN bureau.workspaces w ON w.id = t.workspace_id
  JOIN auth.users au ON au.id = w.created_by
  WHERE t.token = token_text 
    AND t.revoked_at IS NULL;
$$;

COMMENT ON FUNCTION bureau.resolve_ingest_token IS 'Resolves ingest token to workspace/user/email. SECURITY DEFINER bypasses RLS and reads auth.users. Returns empty set (not NULL row) on miss.';

GRANT EXECUTE ON FUNCTION bureau.resolve_ingest_token TO bureau_app;

-- ============================================================================
-- 3. Update bootstrap_workspace to populate email in workspace_members
-- ============================================================================

DROP FUNCTION IF EXISTS bureau.bootstrap_workspace(TEXT);

CREATE OR REPLACE FUNCTION bureau.bootstrap_workspace(
  p_workspace_name TEXT,
  p_user_email TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_workspace_id UUID;
BEGIN
  -- Get current user from auth.uid()
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No authenticated user (auth.uid() is null)';
  END IF;
  
  -- Check if user already has a workspace
  SELECT w.id INTO v_workspace_id
  FROM bureau.workspaces w
  JOIN bureau.workspace_members wm ON wm.workspace_id = w.id
  WHERE wm.user_id = v_user_id
  LIMIT 1;
  
  IF v_workspace_id IS NOT NULL THEN
    -- User already has a workspace, return it
    RETURN v_workspace_id;
  END IF;
  
  -- Create new workspace
  INSERT INTO bureau.workspaces (name, created_by)
  VALUES (p_workspace_name, v_user_id)
  RETURNING id INTO v_workspace_id;
  
  -- Add user as owner with email
  INSERT INTO bureau.workspace_members (workspace_id, user_id, email, role, joined_at)
  VALUES (v_workspace_id, v_user_id, p_user_email, 'owner', NOW());
  
  -- Track onboarding
  INSERT INTO bureau.onboarding_progress (workspace_id, signup_completed_at)
  VALUES (v_workspace_id, NOW());
  
  RETURN v_workspace_id;
END;
$$;

COMMENT ON FUNCTION bureau.bootstrap_workspace IS 'Creates workspace and owner membership for new user. Now stores email in workspace_members.';

GRANT EXECUTE ON FUNCTION bureau.bootstrap_workspace TO bureau_app;

-- ============================================================================
-- 4. Backfill email for existing workspace_members (if any)
-- ============================================================================

-- This runs as a SECURITY DEFINER function so it can read auth.users
CREATE OR REPLACE FUNCTION bureau.backfill_member_emails()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, extensions
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE bureau.workspace_members wm
  SET email = au.email
  FROM auth.users au
  WHERE wm.user_id = au.id
    AND wm.email IS NULL;
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- Run the backfill
SELECT bureau.backfill_member_emails();

-- Drop the backfill function (one-time use)
DROP FUNCTION bureau.backfill_member_emails();
