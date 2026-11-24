-- Slack installations table for workspace-to-team mapping
-- Date: 2026-11-24
-- Purpose: Map Bureau workspaces to Slack team IDs for event routing

SET search_path TO bureau, extensions;

CREATE TABLE IF NOT EXISTS bureau.slack_installations (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL UNIQUE,  -- UNIQUE constraint on team_id
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  installed_by UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_slack_installations_workspace ON bureau.slack_installations(workspace_id);
CREATE INDEX idx_slack_installations_team ON bureau.slack_installations(team_id);

COMMENT ON TABLE bureau.slack_installations IS 'Maps Bureau workspaces to Slack team IDs for event routing';

-- RLS: only workspace owners can manage Slack installations
ALTER TABLE bureau.slack_installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY slack_installations_read
  ON bureau.slack_installations
  FOR SELECT
  USING (workspace_id IN (SELECT bureau.user_workspaces()));

CREATE POLICY slack_installations_owner_write
  ON bureau.slack_installations
  FOR ALL
  USING (
    workspace_id IN (SELECT bureau.user_workspaces())
    AND EXISTS (
      SELECT 1 FROM bureau.workspace_members wm
      WHERE wm.workspace_id = slack_installations.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'owner'
        AND wm.removed_at IS NULL
    )
  );

-- Dedupe table for Slack events
CREATE TABLE IF NOT EXISTS bureau.slack_event_ids (
  event_id TEXT PRIMARY KEY,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_slack_event_ids_received ON bureau.slack_event_ids(received_at);

COMMENT ON TABLE bureau.slack_event_ids IS 'Dedupe Slack event_ids to prevent processing duplicates/retries';

-- Enable RLS on slack_event_ids
ALTER TABLE bureau.slack_event_ids ENABLE ROW LEVEL SECURITY;

-- Policy: anyone can insert/select (deduplication is global)
CREATE POLICY slack_event_ids_insert ON bureau.slack_event_ids FOR INSERT WITH CHECK (true);
CREATE POLICY slack_event_ids_select ON bureau.slack_event_ids FOR SELECT USING (true);

-- Definer functions for Slack (bypass RLS)
CREATE OR REPLACE FUNCTION bureau.slack_resolve_team(p_team_id TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
  SELECT workspace_id FROM bureau.slack_installations WHERE team_id = p_team_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION bureau.slack_find_clone(p_workspace_id UUID, p_handle TEXT)
RETURNS TABLE(id UUID, display_name TEXT, owner_user_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
  SELECT id, display_name, owner_user_id
  FROM bureau.digital_clones
  WHERE workspace_id = p_workspace_id AND handle = p_handle
  LIMIT 1;
$$;

COMMENT ON FUNCTION bureau.slack_resolve_team IS 'Resolve Slack team_id to workspace (bypasses RLS)';
COMMENT ON FUNCTION bureau.slack_find_clone IS 'Find clone by handle in workspace (bypasses RLS)';

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON bureau.slack_installations TO bureau_app;
GRANT SELECT, INSERT ON bureau.slack_event_ids TO bureau_app;
REVOKE ALL ON FUNCTION bureau.slack_resolve_team FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bureau.slack_find_clone FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION bureau.slack_resolve_team TO bureau_app;
GRANT EXECUTE ON FUNCTION bureau.slack_find_clone TO bureau_app;
