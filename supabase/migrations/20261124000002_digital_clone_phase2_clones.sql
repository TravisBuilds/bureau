-- Digital Clone Phase 2: Clone Records & MCP Tools
-- Date: 2026-11-24
-- Purpose: Clone registration, profiles, heartbeats, and MCP tools

SET search_path TO bureau, extensions;

-- Enum for clone vendor
CREATE TYPE bureau.clone_vendor AS ENUM ('openai', 'anthropic', 'cursor', 'custom');

-- Enum for clone protocol version
CREATE TYPE bureau.clone_protocol AS ENUM ('v1');

-- Digital clones table
CREATE TABLE bureau.digital_clones (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_link_id UUID REFERENCES bureau.agent_links(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  handle TEXT NOT NULL,
  vendor bureau.clone_vendor NOT NULL,
  protocol bureau.clone_protocol NOT NULL DEFAULT 'v1',
  timezone TEXT,
  working_hours JSONB,
  slack_handle TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(workspace_id, handle)
);

CREATE INDEX idx_digital_clones_workspace ON bureau.digital_clones(workspace_id);
CREATE INDEX idx_digital_clones_owner ON bureau.digital_clones(owner_user_id);
CREATE INDEX idx_digital_clones_agent_link ON bureau.digital_clones(agent_link_id);
CREATE INDEX idx_digital_clones_last_seen ON bureau.digital_clones(last_seen_at);

COMMENT ON TABLE bureau.digital_clones IS 'Digital clone registrations per team member';

-- Clone profiles table
CREATE TABLE bureau.clone_profiles (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  clone_id UUID NOT NULL REFERENCES bureau.digital_clones(id) ON DELETE CASCADE,
  responsibilities TEXT,
  active_work TEXT,
  decisions_pending TEXT,
  recent_output TEXT,
  availability TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clone_id)
);

CREATE INDEX idx_clone_profiles_clone ON bureau.clone_profiles(clone_id);

COMMENT ON TABLE bureau.clone_profiles IS 'Clone profile data (responsibilities, active work, etc)';

-- Clone heartbeats table
CREATE TABLE bureau.clone_heartbeats (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  clone_id UUID NOT NULL REFERENCES bureau.digital_clones(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  top_priority TEXT,
  active TEXT[],
  blocked TEXT[],
  decisions_waiting_on_me TEXT[],
  waiting_on_others JSONB,
  shipped_since_last TEXT[],
  helping JSONB,
  out_of_office BOOLEAN DEFAULT FALSE,
  confidence TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clone_id, date)
);

CREATE INDEX idx_clone_heartbeats_clone ON bureau.clone_heartbeats(clone_id);
CREATE INDEX idx_clone_heartbeats_date ON bureau.clone_heartbeats(date DESC);

COMMENT ON TABLE bureau.clone_heartbeats IS 'Daily heartbeat updates from clones';

-- Enable RLS on clone tables
ALTER TABLE bureau.digital_clones ENABLE ROW LEVEL SECURITY;
ALTER TABLE bureau.clone_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bureau.clone_heartbeats ENABLE ROW LEVEL SECURITY;

-- Policies: members can view clones in their workspace
CREATE POLICY digital_clones_select ON bureau.digital_clones
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM bureau.workspace_members WHERE user_id = auth.uid() AND removed_at IS NULL
    )
  );

-- Policies: clone profiles readable by workspace members
CREATE POLICY clone_profiles_select ON bureau.clone_profiles
  FOR SELECT
  USING (
    clone_id IN (
      SELECT id FROM bureau.digital_clones WHERE workspace_id IN (
        SELECT workspace_id FROM bureau.workspace_members WHERE user_id = auth.uid() AND removed_at IS NULL
      )
    )
  );

-- Policies: heartbeats readable by workspace members
CREATE POLICY clone_heartbeats_select ON bureau.clone_heartbeats
  FOR SELECT
  USING (
    clone_id IN (
      SELECT id FROM bureau.digital_clones WHERE workspace_id IN (
        SELECT workspace_id FROM bureau.workspace_members WHERE user_id = auth.uid() AND removed_at IS NULL
      )
    )
  );

-- Function: register clone (via MCP)
CREATE OR REPLACE FUNCTION bureau.register_clone(
  p_workspace_id UUID,
  p_owner_user_id UUID,
  p_agent_link_id UUID,
  p_display_name TEXT,
  p_handle TEXT,
  p_vendor bureau.clone_vendor,
  p_protocol bureau.clone_protocol,
  p_timezone TEXT DEFAULT NULL,
  p_working_hours JSONB DEFAULT NULL,
  p_slack_handle TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
DECLARE
  v_clone_id UUID;
  v_existing_owner UUID;
BEGIN
  -- Validate handle (alphanumeric, underscore, hyphen only)
  IF p_handle !~ '^[a-zA-Z0-9_-]+$' THEN
    RAISE EXCEPTION 'Invalid handle. Use only letters, numbers, underscore, and hyphen';
  END IF;
  
  -- Check if handle is already taken by another owner
  SELECT owner_user_id INTO v_existing_owner
  FROM bureau.digital_clones
  WHERE workspace_id = p_workspace_id AND handle = p_handle;
  
  IF v_existing_owner IS NOT NULL AND v_existing_owner != p_owner_user_id THEN
    RAISE EXCEPTION 'HANDLE_TAKEN';
  END IF;
  
  -- Insert or update clone (only owner can update)
  INSERT INTO bureau.digital_clones (
    workspace_id, owner_user_id, agent_link_id, display_name, handle, 
    vendor, protocol, timezone, working_hours, slack_handle, last_seen_at
  ) VALUES (
    p_workspace_id, p_owner_user_id, p_agent_link_id, p_display_name, p_handle,
    p_vendor, p_protocol, p_timezone, p_working_hours, p_slack_handle, NOW()
  )
  ON CONFLICT (workspace_id, handle) 
  DO UPDATE SET
    display_name = EXCLUDED.display_name,
    vendor = EXCLUDED.vendor,
    timezone = EXCLUDED.timezone,
    working_hours = EXCLUDED.working_hours,
    slack_handle = EXCLUDED.slack_handle,
    last_seen_at = NOW(),
    agent_link_id = EXCLUDED.agent_link_id
  WHERE digital_clones.owner_user_id = p_owner_user_id
  RETURNING id INTO v_clone_id;
  
  IF v_clone_id IS NULL THEN
    RAISE EXCEPTION 'HANDLE_TAKEN';
  END IF;
  
  RETURN v_clone_id;
END;
$$;

REVOKE ALL ON FUNCTION bureau.register_clone FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION bureau.register_clone TO bureau_app;

-- Function: update clone profile (via MCP)
CREATE OR REPLACE FUNCTION bureau.update_clone_profile(
  p_workspace_id UUID,
  p_owner_user_id UUID,
  p_clone_id UUID,
  p_responsibilities TEXT DEFAULT NULL,
  p_active_work TEXT DEFAULT NULL,
  p_decisions_pending TEXT DEFAULT NULL,
  p_recent_output TEXT DEFAULT NULL,
  p_availability TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
BEGIN
  -- Verify clone belongs to this workspace and owner
  IF NOT EXISTS (
    SELECT 1 FROM bureau.digital_clones
    WHERE id = p_clone_id AND workspace_id = p_workspace_id AND owner_user_id = p_owner_user_id
  ) THEN
    RAISE EXCEPTION 'Clone not found or access denied';
  END IF;
  
  INSERT INTO bureau.clone_profiles (
    clone_id, responsibilities, active_work, decisions_pending, recent_output, availability, updated_at
  ) VALUES (
    p_clone_id, p_responsibilities, p_active_work, p_decisions_pending, p_recent_output, p_availability, NOW()
  )
  ON CONFLICT (clone_id)
  DO UPDATE SET
    responsibilities = COALESCE(p_responsibilities, clone_profiles.responsibilities),
    active_work = COALESCE(p_active_work, clone_profiles.active_work),
    decisions_pending = COALESCE(p_decisions_pending, clone_profiles.decisions_pending),
    recent_output = COALESCE(p_recent_output, clone_profiles.recent_output),
    availability = COALESCE(p_availability, clone_profiles.availability),
    updated_at = NOW();
  
  -- Update last_seen_at
  UPDATE bureau.digital_clones SET last_seen_at = NOW() WHERE id = p_clone_id;
  
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION bureau.update_clone_profile FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION bureau.update_clone_profile TO bureau_app;

-- Function: post heartbeat (via MCP)
CREATE OR REPLACE FUNCTION bureau.post_clone_heartbeat(
  p_workspace_id UUID,
  p_owner_user_id UUID,
  p_clone_id UUID,
  p_date DATE,
  p_top_priority TEXT,
  p_active TEXT[],
  p_blocked TEXT[],
  p_decisions_waiting_on_me TEXT[],
  p_waiting_on_others JSONB,
  p_shipped_since_last TEXT[],
  p_helping JSONB,
  p_out_of_office BOOLEAN,
  p_confidence TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
BEGIN
  -- Verify clone belongs to this workspace and owner
  IF NOT EXISTS (
    SELECT 1 FROM bureau.digital_clones
    WHERE id = p_clone_id AND workspace_id = p_workspace_id AND owner_user_id = p_owner_user_id
  ) THEN
    RAISE EXCEPTION 'Clone not found or access denied';
  END IF;
  
  INSERT INTO bureau.clone_heartbeats (
    clone_id, date, top_priority, active, blocked, decisions_waiting_on_me,
    waiting_on_others, shipped_since_last, helping, out_of_office, confidence
  ) VALUES (
    p_clone_id, p_date, p_top_priority, p_active, p_blocked, p_decisions_waiting_on_me,
    p_waiting_on_others, p_shipped_since_last, p_helping, p_out_of_office, p_confidence
  )
  ON CONFLICT (clone_id, date)
  DO UPDATE SET
    top_priority = p_top_priority,
    active = p_active,
    blocked = p_blocked,
    decisions_waiting_on_me = p_decisions_waiting_on_me,
    waiting_on_others = p_waiting_on_others,
    shipped_since_last = p_shipped_since_last,
    helping = p_helping,
    out_of_office = p_out_of_office,
    confidence = p_confidence,
    created_at = NOW();
  
  -- Update last_seen_at
  UPDATE bureau.digital_clones SET last_seen_at = NOW() WHERE id = p_clone_id;
  
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION bureau.post_clone_heartbeat FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION bureau.post_clone_heartbeat TO bureau_app;

-- Function: get team health data (via MCP)
CREATE OR REPLACE FUNCTION bureau.get_team_health(
  p_workspace_id UUID
) RETURNS TABLE (
  clone_id UUID,
  display_name TEXT,
  handle TEXT,
  owner_email TEXT,
  is_stale BOOLEAN,
  last_seen_at TIMESTAMPTZ,
  latest_heartbeat JSONB,
  profile JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dc.id,
    dc.display_name,
    dc.handle,
    wm.email as owner_email,
    (dc.last_seen_at IS NULL OR dc.last_seen_at < NOW() - INTERVAL '26 hours') as is_stale,
    dc.last_seen_at,
    to_jsonb(h.*) as latest_heartbeat,
    to_jsonb(cp.*) as profile
  FROM bureau.digital_clones dc
  JOIN bureau.workspace_members wm ON wm.workspace_id = dc.workspace_id AND wm.user_id = dc.owner_user_id AND wm.removed_at IS NULL
  LEFT JOIN LATERAL (
    SELECT * FROM bureau.clone_heartbeats
    WHERE clone_id = dc.id
    ORDER BY date DESC
    LIMIT 1
  ) h ON TRUE
  LEFT JOIN bureau.clone_profiles cp ON cp.clone_id = dc.id
  WHERE dc.workspace_id = p_workspace_id
  ORDER BY (dc.last_seen_at IS NULL OR dc.last_seen_at < NOW() - INTERVAL '26 hours'), dc.display_name;
END;
$$;

REVOKE ALL ON FUNCTION bureau.get_team_health FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION bureau.get_team_health TO bureau_app;

COMMENT ON FUNCTION bureau.register_clone IS 'Register or update a digital clone (via MCP)';
COMMENT ON FUNCTION bureau.update_clone_profile IS 'Update clone profile (via MCP)';
COMMENT ON FUNCTION bureau.post_clone_heartbeat IS 'Post daily heartbeat (via MCP)';
COMMENT ON FUNCTION bureau.get_team_health IS 'Get team health dashboard data (via MCP)';
