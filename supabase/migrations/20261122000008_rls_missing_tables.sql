-- Migration: Enable RLS on bureau.analytics_events, bureau.onboarding_progress, bureau.pilot_invites
-- Date: 2026-11-22
-- Purpose: Secure remaining bureau tables with proper RLS policies

-- ============================================================================
-- ANALYTICS EVENTS
-- ============================================================================

-- Enable RLS
ALTER TABLE bureau.analytics_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access analytics events in their workspace
CREATE POLICY analytics_events_workspace_access ON bureau.analytics_events
  FOR ALL
  USING (
    workspace_id IN (
      SELECT w.id 
      FROM bureau.workspaces w
      JOIN bureau.workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = (current_setting('request.jwt.claim.sub', true))::uuid
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT w.id 
      FROM bureau.workspaces w
      JOIN bureau.workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = (current_setting('request.jwt.claim.sub', true))::uuid
    )
  );

-- ============================================================================
-- ONBOARDING PROGRESS
-- ============================================================================

-- Enable RLS
ALTER TABLE bureau.onboarding_progress ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own workspace's onboarding progress
CREATE POLICY onboarding_progress_workspace_access ON bureau.onboarding_progress
  FOR ALL
  USING (
    workspace_id IN (
      SELECT w.id 
      FROM bureau.workspaces w
      JOIN bureau.workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = (current_setting('request.jwt.claim.sub', true))::uuid
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT w.id 
      FROM bureau.workspaces w
      JOIN bureau.workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = (current_setting('request.jwt.claim.sub', true))::uuid
    )
  );

-- ============================================================================
-- PILOT INVITES
-- ============================================================================

-- Enable RLS
ALTER TABLE bureau.pilot_invites ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view invites they claimed
-- Note: Creation and claiming happens through SECURITY DEFINER functions only
CREATE POLICY pilot_invites_claimed_by_access ON bureau.pilot_invites
  FOR SELECT
  USING (
    claimed_by = (current_setting('request.jwt.claim.sub', true))::uuid
    AND claimed_by IS NOT NULL
  );

-- Policy: Allow insert only through SECURITY DEFINER functions (admin/bootstrap)
-- No direct INSERT policy - must use functions

-- ============================================================================
-- GRANT USAGE
-- ============================================================================

-- Ensure bureau_app can use these tables
GRANT SELECT, INSERT, UPDATE, DELETE ON bureau.analytics_events TO bureau_app;
GRANT SELECT, INSERT, UPDATE ON bureau.onboarding_progress TO bureau_app;
GRANT SELECT ON bureau.pilot_invites TO bureau_app;

-- Note: We do NOT grant bureau_app any privileges on auth schema
-- Bureau never writes to auth.users - that's owned by Supabase Auth and PulseCheck
