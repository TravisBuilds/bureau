-- Bureau Initial Schema with Row-Level Security
-- Run with: npx supabase db push (when Docker available)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE member_role AS ENUM ('owner', 'member');
CREATE TYPE stream_category AS ENUM ('audience', 'production', 'content-distribution', 'project', 'day-job', 'contract');
CREATE TYPE ingest_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE rule_trigger_type AS ENUM ('invoice-overdue', 'budget-exceeded', 'time-scheduled', 'metric-threshold');
CREATE TYPE rule_action_type AS ENUM ('draft-message', 'pause-agent', 'prepare-review', 'notify');
CREATE TYPE usage_source_type AS ENUM ('grok-bot', 'openai', 'google-places', 'google-gemini', 'elevenlabs', 'higgsfield', 'manual');
CREATE TYPE usage_unit AS ENUM ('credits', 'tokens', 'api-calls', 'hours', 'usd');
CREATE TYPE feedback_type AS ENUM ('bug', 'feature', 'general');

-- Workspaces
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES auth.users(id)
);

-- Workspace members
CREATE TABLE workspace_members (
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role member_role NOT NULL,
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  joined_at TIMESTAMPTZ,
  PRIMARY KEY (workspace_id, user_id)
);

-- Streams
CREATE TABLE streams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category stream_category NOT NULL,
  description TEXT NOT NULL,
  connected BOOLEAN DEFAULT FALSE,
  data_source TEXT,
  last_updated TIMESTAMPTZ,
  visible BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Metric values
CREATE TABLE metric_values (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stream_id UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  metric_id TEXT NOT NULL,
  value NUMERIC NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL
);

-- Connections
CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL,
  credential_encrypted TEXT,
  scopes TEXT[] NOT NULL,
  scope_details TEXT NOT NULL,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ,
  connected_by TEXT NOT NULL,
  connected_by_name TEXT NOT NULL,
  oauth_provider TEXT,
  oauth_account_id TEXT,
  oauth_account_name TEXT,
  api_key_type TEXT,
  api_key_hint TEXT
);

-- Ingest tokens
CREATE TABLE ingest_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ
);

-- Ingest log
CREATE TABLE ingest_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_id UUID NOT NULL REFERENCES ingest_tokens(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  status ingest_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT
);

-- Pilot invites
CREATE TABLE pilot_invites (
  code TEXT PRIMARY KEY,
  email TEXT,
  claimed_by TEXT,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Weekly reviews
CREATE TABLE weekly_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  stream_id UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  objective TEXT NOT NULL,
  constraint_text TEXT NOT NULL,
  moves JSONB NOT NULL,
  chosen_move INTEGER,
  chosen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Automation rules
CREATE TABLE automation_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stream_id UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  trigger_type rule_trigger_type NOT NULL,
  trigger_condition TEXT NOT NULL,
  action_type rule_action_type NOT NULL,
  action_details TEXT NOT NULL,
  requires_approval BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_triggered TIMESTAMPTZ,
  trigger_count INTEGER DEFAULT 0
);

-- Usage records
CREATE TABLE usage_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stream_id UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  source_type usage_source_type NOT NULL,
  source_name TEXT NOT NULL,
  units NUMERIC NOT NULL,
  unit_type usage_unit NOT NULL,
  cost_usd NUMERIC NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  as_of TIMESTAMPTZ NOT NULL,
  budget_cap NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Analytics events
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID,
  user_id TEXT,
  event_name TEXT NOT NULL,
  properties JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Feedback
CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  type feedback_type NOT NULL,
  message TEXT NOT NULL,
  screenshot_url TEXT,
  page TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Error logs
CREATE TABLE error_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT,
  error_type TEXT NOT NULL,
  message TEXT NOT NULL,
  stack_trace TEXT,
  url TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Onboarding progress
CREATE TABLE onboarding_progress (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  signup_completed_at TIMESTAMPTZ NOT NULL,
  first_stream_at TIMESTAMPTZ,
  first_connection_at TIMESTAMPTZ,
  first_finding_at TIMESTAMPTZ,
  time_to_first_finding INTEGER
);

-- Row-Level Security Policies
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE metric_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Workspace isolation: users can only access their own workspaces
CREATE POLICY workspace_access ON workspaces
  USING (
    id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY workspace_member_access ON workspace_members
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY stream_access ON streams
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY metric_value_access ON metric_values
  USING (
    stream_id IN (
      SELECT s.id FROM streams s
      JOIN workspace_members wm ON wm.workspace_id = s.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY connection_access ON connections
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY ingest_token_access ON ingest_tokens
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY ingest_log_access ON ingest_log
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY weekly_review_access ON weekly_reviews
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY automation_rule_access ON automation_rules
  USING (
    stream_id IN (
      SELECT s.id FROM streams s
      JOIN workspace_members wm ON wm.workspace_id = s.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY usage_record_access ON usage_records
  USING (
    stream_id IN (
      SELECT s.id FROM streams s
      JOIN workspace_members wm ON wm.workspace_id = s.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY feedback_access ON feedback
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY error_log_access ON error_logs
  USING (
    workspace_id IS NULL OR workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Indexes for performance
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX idx_streams_workspace ON streams(workspace_id);
CREATE INDEX idx_metric_values_stream ON metric_values(stream_id);
CREATE INDEX idx_connections_workspace ON connections(workspace_id);
CREATE INDEX idx_ingest_tokens_workspace ON ingest_tokens(workspace_id);
CREATE INDEX idx_ingest_log_workspace ON ingest_log(workspace_id);
CREATE INDEX idx_weekly_reviews_workspace ON weekly_reviews(workspace_id);
CREATE INDEX idx_automation_rules_stream ON automation_rules(stream_id);
CREATE INDEX idx_usage_records_stream ON usage_records(stream_id);
CREATE INDEX idx_analytics_events_workspace ON analytics_events(workspace_id);
