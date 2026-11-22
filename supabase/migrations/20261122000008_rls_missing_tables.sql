-- Migration: Enable RLS on bureau.analytics_events, bureau.onboarding_progress, bureau.pilot_invites
-- Date: 2026-11-22
-- Purpose: Secure remaining bureau tables with proper RLS policies
-- Pattern: Uses bureau.user_workspaces() SECURITY DEFINER function (matches existing policies)

-- ============================================================================
-- ANALYTICS EVENTS
-- ============================================================================

-- Enable RLS
ALTER TABLE bureau.analytics_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access analytics events in their workspace
-- Uses bureau.user_workspaces() which calls auth.uid() (matches existing policies)
DROP POLICY IF EXISTS analytics_events_workspace_access ON bureau.analytics_events;
CREATE POLICY analytics_events_workspace_access ON bureau.analytics_events
  FOR ALL
  USING (workspace_id IN (SELECT bureau.user_workspaces()));

-- ============================================================================
-- ONBOARDING PROGRESS
-- ============================================================================

-- Enable RLS
ALTER TABLE bureau.onboarding_progress ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own workspace's onboarding progress
-- Uses bureau.user_workspaces() which calls auth.uid() (matches existing policies)
DROP POLICY IF EXISTS onboarding_progress_workspace_access ON bureau.onboarding_progress;
CREATE POLICY onboarding_progress_workspace_access ON bureau.onboarding_progress
  FOR ALL
  USING (workspace_id IN (SELECT bureau.user_workspaces()));

-- ============================================================================
-- PILOT INVITES
-- ============================================================================

-- Enable RLS
ALTER TABLE bureau.pilot_invites ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view invites they claimed
-- Uses auth.uid() directly (no workspace_id on this table)
DROP POLICY IF EXISTS pilot_invites_claimed_by_access ON bureau.pilot_invites;
CREATE POLICY pilot_invites_claimed_by_access ON bureau.pilot_invites
  FOR SELECT
  USING (
    claimed_by = auth.uid()
    AND claimed_by IS NOT NULL
  );

-- NO INSERT/UPDATE/DELETE policies on pilot_invites
-- All writes happen through SECURITY DEFINER functions:
-- - bureau.claim_pilot_invite (users claim codes)
-- - Admin functions (create invites)
-- These functions bypass RLS so they keep working

-- ============================================================================
-- VERIFY SECURITY DEFINER FUNCTIONS
-- ============================================================================

-- Confirm claim_pilot_invite and bootstrap_workspace are SECURITY DEFINER
-- (They were created in migration 20261122000006_rls_definer_functions.sql)
-- If they weren't SECURITY DEFINER, the functions would fail with RLS enabled

-- bureau.claim_pilot_invite: SECURITY DEFINER ✓
-- bureau.bootstrap_workspace: SECURITY DEFINER ✓
-- bureau.user_workspaces(): SECURITY DEFINER ✓

-- ============================================================================
-- GRANT USAGE
-- ============================================================================

-- Ensure bureau_app can use these tables (grants for SECURITY DEFINER functions)
GRANT SELECT, INSERT, UPDATE, DELETE ON bureau.analytics_events TO bureau_app;
GRANT SELECT, INSERT, UPDATE ON bureau.onboarding_progress TO bureau_app;
GRANT SELECT, UPDATE ON bureau.pilot_invites TO bureau_app;

-- Note: We do NOT grant bureau_app on auth schema
-- Bureau never writes to auth.users - that's owned by Supabase Auth and PulseCheck
