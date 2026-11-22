-- Bureau Initial Schema with Row-Level Security
-- Lives in bureau schema (shared Supabase project, PulseCheck owns public)
-- Run with: npx supabase db push

-- Create bureau schema and extensions
CREATE SCHEMA IF NOT EXISTS bureau;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- Set search path for this migration
SET search_path TO bureau, extensions;

-- Enums
CREATE TYPE bureau.member_role AS ENUM ('owner', 'member');
CREATE TYPE bureau.stream_category AS ENUM ('audience', 'production', 'content-distribution', 'project', 'day-job', 'contract');
CREATE TYPE bureau.ingest_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE bureau.rule_trigger_type AS ENUM ('invoice-overdue', 'budget-exceeded', 'time-scheduled', 'metric-threshold');
CREATE TYPE bureau.rule_action_type AS ENUM ('draft-message', 'pause-agent', 'prepare-review', 'notify');
CREATE TYPE bureau.usage_source_type AS ENUM ('grok-bot', 'openai', 'google-places', 'google-gemini', 'elevenlabs', 'higgsfield', 'manual');
CREATE TYPE bureau.usage_unit AS ENUM ('credits', 'tokens', 'api-calls', 'hours', 'usd');
CREATE TYPE bureau.feedback_type AS ENUM ('bug', 'feature', 'general');

-- Workspaces
CREATE TABLE bureau.workspaces (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES auth.users(id)
);

-- Workspace members
CREATE TABLE bureau.workspace_members (
  workspace_id UUID REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role bureau.member_role NOT NULL,
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  joined_at TIMESTAMPTZ,
  PRIMARY KEY (workspace_id, user_id)
);

-- Streams
CREATE TABLE bureau.streams (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category bureau.stream_category NOT NULL,
  description TEXT NOT NULL,
  connected BOOLEAN DEFAULT FALSE,
  data_source TEXT,
  last_updated TIMESTAMPTZ,
  visible BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Metric values
CREATE TABLE bureau.metric_values (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  stream_id UUID NOT NULL REFERENCES bureau.streams(id) ON DELETE CASCADE,
  metric_id TEXT NOT NULL,
  value NUMERIC NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL
);

-- Connections
CREATE TABLE bureau.connections (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
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
CREATE TABLE bureau.ingest_tokens (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ
);

-- Ingest log
CREATE TABLE bureau.ingest_log (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
  token_id UUID NOT NULL REFERENCES bureau.ingest_tokens(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  status bureau.ingest_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT
);

-- Pilot invites
CREATE TABLE bureau.pilot_invites (
  code TEXT PRIMARY KEY,
  email TEXT,
  claimed_by TEXT,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Weekly reviews
CREATE TABLE bureau.weekly_reviews (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
  stream_id UUID NOT NULL REFERENCES bureau.streams(id) ON DELETE CASCADE,
  objective TEXT NOT NULL,
  constraint_text TEXT NOT NULL,
  moves JSONB NOT NULL,
  chosen_move INTEGER,
  chosen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Automation rules
CREATE TABLE bureau.automation_rules (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  stream_id UUID NOT NULL REFERENCES bureau.streams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  trigger_type bureau.rule_trigger_type NOT NULL,
  trigger_condition TEXT NOT NULL,
  action_type bureau.rule_action_type NOT NULL,
  action_details TEXT NOT NULL,
  requires_approval BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_triggered TIMESTAMPTZ,
  trigger_count INTEGER DEFAULT 0
);

-- Usage records
CREATE TABLE bureau.usage_records (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  stream_id UUID NOT NULL REFERENCES bureau.streams(id) ON DELETE CASCADE,
  source_type bureau.usage_source_type NOT NULL,
  source_name TEXT NOT NULL,
  units NUMERIC NOT NULL,
  unit_type bureau.usage_unit NOT NULL,
  cost_usd NUMERIC NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  as_of TIMESTAMPTZ NOT NULL,
  budget_cap NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Analytics events
CREATE TABLE bureau.analytics_events (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  workspace_id UUID,
  user_id TEXT,
  event_name TEXT NOT NULL,
  properties JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Feedback
CREATE TABLE bureau.feedback (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  type bureau.feedback_type NOT NULL,
  message TEXT NOT NULL,
  screenshot_url TEXT,
  page TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Error logs
CREATE TABLE bureau.error_logs (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  workspace_id UUID REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
  user_id TEXT,
  error_type TEXT NOT NULL,
  message TEXT NOT NULL,
  stack_trace TEXT,
  url TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Onboarding progress
CREATE TABLE bureau.onboarding_progress (
  workspace_id UUID PRIMARY KEY REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
  signup_completed_at TIMESTAMPTZ NOT NULL,
  first_stream_at TIMESTAMPTZ,
  first_connection_at TIMESTAMPTZ,
  first_finding_at TIMESTAMPTZ,
  time_to_first_finding INTEGER
);

-- Row-Level Security Policies
ALTER TABLE bureau.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE bureau.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE bureau.streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE bureau.metric_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE bureau.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE bureau.ingest_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE bureau.ingest_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE bureau.weekly_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE bureau.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE bureau.usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE bureau.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE bureau.error_logs ENABLE ROW LEVEL SECURITY;

-- Workspace isolation: users can only access their own workspaces
CREATE POLICY workspace_access ON bureau.workspaces
  USING (
    id IN (
      SELECT workspace_id FROM bureau.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY workspace_member_access ON bureau.workspace_members
  USING (
    workspace_id IN (
      SELECT workspace_id FROM bureau.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY stream_access ON bureau.streams
  USING (
    workspace_id IN (
      SELECT workspace_id FROM bureau.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY metric_value_access ON bureau.metric_values
  USING (
    stream_id IN (
      SELECT s.id FROM bureau.streams s
      JOIN bureau.workspace_members wm ON wm.workspace_id = s.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY connection_access ON bureau.connections
  USING (
    workspace_id IN (
      SELECT workspace_id FROM bureau.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY ingest_token_access ON bureau.ingest_tokens
  USING (
    workspace_id IN (
      SELECT workspace_id FROM bureau.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY ingest_log_access ON bureau.ingest_log
  USING (
    workspace_id IN (
      SELECT workspace_id FROM bureau.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY weekly_review_access ON bureau.weekly_reviews
  USING (
    workspace_id IN (
      SELECT workspace_id FROM bureau.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY automation_rule_access ON bureau.automation_rules
  USING (
    stream_id IN (
      SELECT s.id FROM bureau.streams s
      JOIN bureau.workspace_members wm ON wm.workspace_id = s.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY usage_record_access ON bureau.usage_records
  USING (
    stream_id IN (
      SELECT s.id FROM bureau.streams s
      JOIN bureau.workspace_members wm ON wm.workspace_id = s.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY feedback_access ON bureau.feedback
  USING (
    workspace_id IN (
      SELECT workspace_id FROM bureau.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY error_log_access ON bureau.error_logs
  USING (
    workspace_id IS NULL OR workspace_id IN (
      SELECT workspace_id FROM bureau.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Indexes for performance
CREATE INDEX idx_workspace_members_user ON bureau.workspace_members(user_id);
CREATE INDEX idx_streams_workspace ON bureau.streams(workspace_id);
CREATE INDEX idx_metric_values_stream ON bureau.metric_values(stream_id);
CREATE INDEX idx_connections_workspace ON bureau.connections(workspace_id);
CREATE INDEX idx_ingest_tokens_workspace ON bureau.ingest_tokens(workspace_id);
CREATE INDEX idx_ingest_log_workspace ON bureau.ingest_log(workspace_id);
CREATE INDEX idx_weekly_reviews_workspace ON bureau.weekly_reviews(workspace_id);
CREATE INDEX idx_automation_rules_stream ON bureau.automation_rules(stream_id);
CREATE INDEX idx_usage_records_stream ON bureau.usage_records(stream_id);
CREATE INDEX idx_analytics_events_workspace ON bureau.analytics_events(workspace_id);
