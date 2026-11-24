-- Slack installations table for workspace-to-team mapping
-- Date: 2026-11-24
-- Purpose: Map Bureau workspaces to Slack team IDs for event routing

SET search_path TO bureau, extensions;

CREATE TABLE IF NOT EXISTS bureau.slack_installations (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL,
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  installed_by UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(workspace_id, team_id)
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

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON bureau.slack_installations TO bureau_app;
GRANT SELECT, INSERT ON bureau.slack_event_ids TO bureau_app;
