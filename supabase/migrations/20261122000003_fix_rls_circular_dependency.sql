-- Fix RLS circular dependency between streams and workspace_members
-- 
-- Problem: streams RLS policy checks workspace_members, but workspace_members
-- also has RLS enabled, creating a circular dependency where the streams policy
-- cannot read workspace_members.
--
-- Solution: Create a SECURITY DEFINER function that bypasses RLS to get
-- the user's accessible workspaces.

-- Function to get workspaces accessible by current user (bypasses RLS)
CREATE OR REPLACE FUNCTION auth.user_workspaces()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT workspace_id 
  FROM workspace_members 
  WHERE user_id = auth.uid();
$$;

-- Update streams RLS policy to use the security definer function
DROP POLICY IF EXISTS stream_access ON streams;
CREATE POLICY stream_access ON streams
  FOR ALL
  USING (workspace_id IN (SELECT auth.user_workspaces()));

-- Update other tables' RLS policies to use the same function
DROP POLICY IF EXISTS workspace_member_access ON workspace_members;
CREATE POLICY workspace_member_access ON workspace_members
  FOR ALL
  USING (workspace_id IN (SELECT auth.user_workspaces()));

DROP POLICY IF EXISTS connection_access ON connections;
CREATE POLICY connection_access ON connections
  FOR ALL
  USING (workspace_id IN (SELECT auth.user_workspaces()));

DROP POLICY IF EXISTS ingest_token_access ON ingest_tokens;
CREATE POLICY ingest_token_access ON ingest_tokens
  FOR ALL
  USING (workspace_id IN (SELECT auth.user_workspaces()));

DROP POLICY IF EXISTS ingest_log_access ON ingest_log;
CREATE POLICY ingest_log_access ON ingest_log
  FOR ALL
  USING (workspace_id IN (SELECT auth.user_workspaces()));

DROP POLICY IF EXISTS weekly_review_access ON weekly_reviews;
CREATE POLICY weekly_review_access ON weekly_reviews
  FOR ALL
  USING (workspace_id IN (SELECT auth.user_workspaces()));

DROP POLICY IF EXISTS metric_value_access ON metric_values;
CREATE POLICY metric_value_access ON metric_values
  FOR ALL
  USING (stream_id IN (
    SELECT id FROM streams WHERE workspace_id IN (SELECT auth.user_workspaces())
  ));

DROP POLICY IF EXISTS output_costs_workspace_isolation ON output_costs;
CREATE POLICY output_costs_workspace_isolation ON output_costs
  FOR ALL
  USING (stream_id IN (
    SELECT id FROM streams WHERE workspace_id IN (SELECT auth.user_workspaces())
  ));

DROP POLICY IF EXISTS automation_rule_access ON automation_rules;
CREATE POLICY automation_rule_access ON automation_rules
  FOR ALL
  USING (stream_id IN (
    SELECT id FROM streams WHERE workspace_id IN (SELECT auth.user_workspaces())
  ));

DROP POLICY IF EXISTS usage_record_access ON usage_records;
CREATE POLICY usage_record_access ON usage_records
  FOR ALL
  USING (stream_id IN (
    SELECT id FROM streams WHERE workspace_id IN (SELECT auth.user_workspaces())
  ));

DROP POLICY IF EXISTS pilot_invite_access ON pilot_invites;
-- Pilot invites are global, no RLS needed

DROP POLICY IF EXISTS analytics_event_access ON analytics_events;
CREATE POLICY analytics_event_access ON analytics_events
  FOR ALL
  USING (workspace_id IN (SELECT auth.user_workspaces()));

DROP POLICY IF EXISTS feedback_access ON feedback;
CREATE POLICY feedback_access ON feedback
  FOR ALL
  USING (workspace_id IN (SELECT auth.user_workspaces()));

DROP POLICY IF EXISTS error_log_access ON error_logs;
CREATE POLICY error_log_access ON error_logs
  FOR ALL
  USING (workspace_id IN (SELECT auth.user_workspaces()));

COMMENT ON FUNCTION auth.user_workspaces() IS 'Returns workspace IDs accessible by current user. SECURITY DEFINER bypasses RLS to avoid circular dependencies.';
