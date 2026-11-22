-- RLS SECURITY DEFINER Functions
-- Allows bureau_app (non-superuser) to perform privileged operations
-- without bypassing RLS globally

SET search_path TO bureau, extensions;

-- ============================================================================
-- 1. Ingest Token Resolution
-- ============================================================================
-- Resolve ingest token to workspace/owner without RLS interference
-- Called before auth.uid() is known (token lookup happens first)

CREATE OR REPLACE FUNCTION bureau.resolve_ingest_token(
  token_text TEXT,
  OUT workspace_id UUID,
  OUT user_id UUID,
  OUT token_id UUID
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = bureau, extensions
AS $$
  SELECT 
    t.workspace_id,
    w.created_by as user_id,
    t.id as token_id
  FROM bureau.ingest_tokens t
  JOIN bureau.workspaces w ON w.id = t.workspace_id
  WHERE t.token = token_text 
    AND t.revoked_at IS NULL;
$$;

COMMENT ON FUNCTION bureau.resolve_ingest_token IS 'Resolves ingest token to workspace/user. SECURITY DEFINER bypasses RLS for token lookup.';

GRANT EXECUTE ON FUNCTION bureau.resolve_ingest_token TO bureau_app;

-- ============================================================================
-- 2. Ingest Log Insert
-- ============================================================================
-- Insert ingest log entry for a specific workspace (called with auth.uid() set)

CREATE OR REPLACE FUNCTION bureau.insert_ingest_log(
  p_workspace_id UUID,
  p_token_id UUID,
  p_payload JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, extensions
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  -- Update last_used_at on token
  UPDATE bureau.ingest_tokens 
  SET last_used_at = NOW() 
  WHERE id = p_token_id;
  
  -- Insert ingest log
  INSERT INTO bureau.ingest_log (
    workspace_id, 
    token_id, 
    payload, 
    status
  ) VALUES (
    p_workspace_id,
    p_token_id,
    p_payload,
    'pending'
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

COMMENT ON FUNCTION bureau.insert_ingest_log IS 'Inserts ingest log entry. SECURITY DEFINER to write regardless of RLS (workspace_id is validated by caller).';

GRANT EXECUTE ON FUNCTION bureau.insert_ingest_log TO bureau_app;

-- ============================================================================
-- 3. Bootstrap Workspace (First Login)
-- ============================================================================
-- Create workspace and owner membership for new user

CREATE OR REPLACE FUNCTION bureau.bootstrap_workspace(
  p_workspace_name TEXT
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
  
  -- Add user as owner
  INSERT INTO bureau.workspace_members (workspace_id, user_id, role, joined_at)
  VALUES (v_workspace_id, v_user_id, 'owner', NOW());
  
  -- Track onboarding
  INSERT INTO bureau.onboarding_progress (workspace_id, signup_completed_at)
  VALUES (v_workspace_id, NOW());
  
  RETURN v_workspace_id;
END;
$$;

COMMENT ON FUNCTION bureau.bootstrap_workspace IS 'Creates workspace and owner membership for new user. SECURITY DEFINER bypasses RLS for first-login writes.';

GRANT EXECUTE ON FUNCTION bureau.bootstrap_workspace TO bureau_app;

-- ============================================================================
-- 4. Pilot Invite Claiming
-- ============================================================================
-- Claim a pilot invite code (updates pilot_invites table)

CREATE OR REPLACE FUNCTION bureau.claim_pilot_invite(
  p_invite_code TEXT,
  p_user_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, extensions
AS $$
DECLARE
  v_existing_claim TEXT;
BEGIN
  -- Check if invite exists and is valid
  SELECT claimed_by INTO v_existing_claim
  FROM bureau.pilot_invites
  WHERE code = p_invite_code
    AND expires_at > NOW();
  
  IF NOT FOUND THEN
    RETURN FALSE; -- Invalid or expired invite
  END IF;
  
  IF v_existing_claim IS NOT NULL THEN
    RETURN FALSE; -- Already claimed
  END IF;
  
  -- Claim the invite
  UPDATE bureau.pilot_invites
  SET claimed_by = p_user_id::TEXT,
      claimed_at = NOW()
  WHERE code = p_invite_code
    AND claimed_by IS NULL; -- Prevent race condition
  
  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION bureau.claim_pilot_invite IS 'Claims a pilot invite code. SECURITY DEFINER to update pilot_invites regardless of RLS.';

GRANT EXECUTE ON FUNCTION bureau.claim_pilot_invite TO bureau_app;

-- ============================================================================
-- 5. Workspace INSERT Policy (for direct INSERTs if needed)
-- ============================================================================
-- Allow users to create their own workspaces

DROP POLICY IF EXISTS workspace_insert ON bureau.workspaces;
CREATE POLICY workspace_insert ON bureau.workspaces
  FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- ============================================================================
-- 6. Workspace Members Self-Insert (for direct INSERTs if needed)
-- ============================================================================
-- Allow users to add themselves as members

DROP POLICY IF EXISTS workspace_member_insert ON bureau.workspace_members;
CREATE POLICY workspace_member_insert ON bureau.workspace_members
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Note: Most operations should use the SECURITY DEFINER functions above
-- These policies are fallbacks for direct table access patterns
