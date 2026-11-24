-- Digital Clone Phase 1: Team Membership
-- Date: 2026-11-24
-- Purpose: Invite teammates, roles (owner|admin|member), member management

SET search_path TO bureau, extensions;

-- Note: 'admin' role added in migration 20261124000000_add_admin_role.sql

-- Add invite fields to workspace_members
ALTER TABLE bureau.workspace_members
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS invite_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_by UUID REFERENCES auth.users(id);

-- Create pending invites table
CREATE TABLE IF NOT EXISTS bureau.workspace_invites (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role bureau.member_role NOT NULL DEFAULT 'member',
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id),
  UNIQUE(workspace_id, email)
);

CREATE INDEX idx_workspace_invites_workspace ON bureau.workspace_invites(workspace_id);
CREATE INDEX idx_workspace_invites_email ON bureau.workspace_invites(email);
CREATE INDEX idx_workspace_invites_status ON bureau.workspace_invites(workspace_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL;

COMMENT ON TABLE bureau.workspace_invites IS 'Pending workspace invitations by email';

-- Enable RLS on workspace_invites
ALTER TABLE bureau.workspace_invites ENABLE ROW LEVEL SECURITY;

-- Policy: members can view invites for their workspace
CREATE POLICY workspace_invites_select ON bureau.workspace_invites
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM bureau.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Policy: owners and admins can insert invites
CREATE POLICY workspace_invites_insert ON bureau.workspace_invites
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM bureau.workspace_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Policy: owners and admins can update invites
CREATE POLICY workspace_invites_update ON bureau.workspace_invites
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM bureau.workspace_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Function: invite member (owner/admin only)
CREATE OR REPLACE FUNCTION bureau.invite_member(
  p_workspace_id UUID,
  p_email TEXT,
  p_role bureau.member_role,
  p_invited_by UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
DECLARE
  v_invite_id UUID;
  v_inviter_role bureau.member_role;
BEGIN
  -- Check if inviter is active owner or admin
  SELECT role INTO v_inviter_role
  FROM bureau.workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = p_invited_by AND removed_at IS NULL;
  
  IF v_inviter_role IS NULL THEN
    RAISE EXCEPTION 'User is not a member of this workspace';
  END IF;
  
  IF v_inviter_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only owners and admins can invite members';
  END IF;
  
  -- Only owners can invite admins
  IF p_role = 'admin' AND v_inviter_role != 'owner' THEN
    RAISE EXCEPTION 'Only owners can invite admins';
  END IF;
  
  -- Check if already a member
  IF EXISTS (
    SELECT 1 FROM bureau.workspace_members 
    WHERE workspace_id = p_workspace_id AND user_id IN (
      SELECT id FROM auth.users WHERE email = p_email
    ) AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'User is already a member of this workspace';
  END IF;
  
  -- Insert or update invite
  INSERT INTO bureau.workspace_invites (
    workspace_id, email, role, invited_by, expires_at
  ) VALUES (
    p_workspace_id, p_email, p_role, p_invited_by, NOW() + INTERVAL '7 days'
  )
  ON CONFLICT (workspace_id, email) 
  DO UPDATE SET 
    role = p_role,
    invited_by = p_invited_by,
    invited_at = NOW(),
    expires_at = NOW() + INTERVAL '7 days',
    revoked_at = NULL,
    revoked_by = NULL
  RETURNING id INTO v_invite_id;
  
  RETURN v_invite_id;
END;
$$;

REVOKE ALL ON FUNCTION bureau.invite_member FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION bureau.invite_member TO bureau_app;

-- Function: accept invite (called on sign-in)
CREATE OR REPLACE FUNCTION bureau.accept_invite(
  p_email TEXT,
  p_user_id UUID
) RETURNS TABLE (
  workspace_id UUID,
  workspace_name TEXT,
  role bureau.member_role
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
BEGIN
  -- Mark invites as accepted and add to workspace_members (or reactivate if removed)
  INSERT INTO bureau.workspace_members (workspace_id, user_id, role, invited_at, joined_at, invited_by)
  SELECT i.workspace_id, p_user_id, i.role, i.invited_at, NOW(), i.invited_by
  FROM bureau.workspace_invites i
  WHERE i.email = p_email 
    AND i.accepted_at IS NULL 
    AND i.revoked_at IS NULL
    AND i.expires_at > NOW()
  ON CONFLICT (workspace_id, user_id) DO UPDATE
  SET removed_at = NULL, removed_by = NULL, role = EXCLUDED.role, joined_at = NOW();
  
  -- Mark invites as accepted
  UPDATE bureau.workspace_invites
  SET accepted_at = NOW(), accepted_by = p_user_id
  WHERE email = p_email 
    AND accepted_at IS NULL 
    AND revoked_at IS NULL
    AND expires_at > NOW();
  
  -- Return accepted workspaces
  RETURN QUERY
  SELECT w.id, w.name, wm.role
  FROM bureau.workspaces w
  JOIN bureau.workspace_members wm ON wm.workspace_id = w.id
  WHERE wm.user_id = p_user_id AND wm.removed_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION bureau.accept_invite FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION bureau.accept_invite TO bureau_app;

-- Function: remove member (owner only, cannot remove last owner)
CREATE OR REPLACE FUNCTION bureau.remove_member(
  p_workspace_id UUID,
  p_user_id_to_remove UUID,
  p_removed_by UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
DECLARE
  v_remover_role bureau.member_role;
  v_target_role bureau.member_role;
  v_owner_count INTEGER;
BEGIN
  -- Check if remover is active owner
  SELECT role INTO v_remover_role
  FROM bureau.workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = p_removed_by AND removed_at IS NULL;
  
  IF v_remover_role IS NULL THEN
    RAISE EXCEPTION 'User is not a member of this workspace';
  END IF;
  
  IF v_remover_role != 'owner' THEN
    RAISE EXCEPTION 'Only owners can remove members';
  END IF;
  
  -- Cannot remove self
  IF p_user_id_to_remove = p_removed_by THEN
    RAISE EXCEPTION 'Cannot remove yourself';
  END IF;
  
  -- Check target role
  SELECT role INTO v_target_role
  FROM bureau.workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = p_user_id_to_remove;
  
  -- If removing an owner, ensure at least one owner remains
  IF v_target_role = 'owner' THEN
    SELECT COUNT(*) INTO v_owner_count
    FROM bureau.workspace_members
    WHERE workspace_id = p_workspace_id AND role = 'owner' AND removed_at IS NULL;
    
    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the last owner';
    END IF;
  END IF;
  
  -- Mark as removed
  UPDATE bureau.workspace_members
  SET removed_at = NOW(), removed_by = p_removed_by
  WHERE workspace_id = p_workspace_id AND user_id = p_user_id_to_remove;
  
  -- Revoke all OAuth grants for this user in this workspace
  UPDATE bureau.oauth_grants
  SET status = 'revoked', revoked_at = NOW(), revoked_reason = 'Member removed from workspace'
  WHERE workspace_id = p_workspace_id AND user_id = p_user_id_to_remove;
  
  -- Revoke all legacy ingest tokens for this user in this workspace
  UPDATE bureau.ingest_tokens
  SET revoked_at = NOW()
  WHERE workspace_id = p_workspace_id 
    AND id IN (
      SELECT t.id FROM bureau.ingest_tokens t
      JOIN bureau.workspaces w ON w.id = t.workspace_id
      WHERE t.workspace_id = p_workspace_id AND w.created_by = p_user_id_to_remove
    );
  
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION bureau.remove_member FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION bureau.remove_member TO bureau_app;

COMMENT ON FUNCTION bureau.invite_member IS 'Invite a member by email (owner/admin only)';
COMMENT ON FUNCTION bureau.accept_invite IS 'Accept pending invites on sign-in';
COMMENT ON FUNCTION bureau.remove_member IS 'Remove a member and revoke their OAuth grants (owner only)';
