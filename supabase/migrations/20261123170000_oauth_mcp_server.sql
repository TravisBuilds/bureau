-- OAuth 2.1 + MCP Server Schema
-- Phase 0 spike: Bureau as authorization server for ChatGPT/Grok Bot/Cursor MCP clients
-- Date: 2026-11-23
-- Purpose: Enable agents to connect via OAuth with PKCE, refresh rotation, per-agent scoping

SET search_path TO bureau, extensions;

-- ============================================================================
-- 1. OAUTH CLIENTS (global registry)
-- ============================================================================

CREATE TABLE bureau.oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  client_uri TEXT,
  redirect_uris TEXT[] NOT NULL CHECK (array_length(redirect_uris, 1) > 0),
  registration TEXT NOT NULL CHECK (registration IN ('static', 'cimd', 'dcr')),
  vendor TEXT CHECK (vendor IN ('openai', 'grokbot', 'cursor', 'script', 'other')),
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_oauth_clients_vendor ON bureau.oauth_clients(vendor);
COMMENT ON TABLE bureau.oauth_clients IS 'OAuth 2.1 client registry. Static clients verified, DCR clients flagged unverified.';

-- ============================================================================
-- 2. OAUTH GRANTS (a.k.a. connections, one per user+client+workspace)
-- ============================================================================

CREATE TABLE bureau.oauth_grants (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES bureau.oauth_clients(client_id) ON DELETE CASCADE,
  vendor TEXT,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  resource TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'needs_reauth')),
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(workspace_id, user_id, client_id)
);

CREATE INDEX idx_oauth_grants_workspace ON bureau.oauth_grants(workspace_id);
CREATE INDEX idx_oauth_grants_user ON bureau.oauth_grants(user_id);
CREATE INDEX idx_oauth_grants_status ON bureau.oauth_grants(status);
COMMENT ON TABLE bureau.oauth_grants IS 'OAuth grants (connections) per user+client+workspace. One grant can have multiple agent_links.';

-- ============================================================================
-- 3. AGENT LINKS (per-agent stream allowlists on a grant)
-- ============================================================================

CREATE TABLE bureau.agent_links (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
  grant_id UUID NOT NULL REFERENCES bureau.oauth_grants(id) ON DELETE CASCADE,
  agent_label TEXT NOT NULL,
  agent_ref TEXT,
  stream_ids UUID[] NOT NULL DEFAULT '{}',
  allow_create_streams BOOLEAN DEFAULT FALSE,
  scopes TEXT[] NOT NULL DEFAULT '{"ingest:write"}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(grant_id, agent_label)
);

CREATE INDEX idx_agent_links_workspace ON bureau.agent_links(workspace_id);
CREATE INDEX idx_agent_links_grant ON bureau.agent_links(grant_id);
CREATE INDEX idx_agent_links_status ON bureau.agent_links(status);
COMMENT ON TABLE bureau.agent_links IS 'Per-agent stream allowlists. Enforcement: ingest checks stream_id in stream_ids.';

-- ============================================================================
-- 4. OAUTH TOKENS (secret-bearing, hashed storage)
-- ============================================================================

CREATE TABLE bureau.oauth_tokens (
  token_hash TEXT PRIMARY KEY,
  token_prefix TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('access', 'refresh')),
  grant_id UUID NOT NULL REFERENCES bureau.oauth_grants(id) ON DELETE CASCADE,
  family_id UUID,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_oauth_tokens_grant ON bureau.oauth_tokens(grant_id);
CREATE INDEX idx_oauth_tokens_family ON bureau.oauth_tokens(family_id) WHERE family_id IS NOT NULL;
CREATE INDEX idx_oauth_tokens_expires ON bureau.oauth_tokens(expires_at);
COMMENT ON TABLE bureau.oauth_tokens IS 'OAuth access/refresh tokens, SHA-256 hashed. Refresh tokens rotate on use, family_id for reuse detection.';

-- ============================================================================
-- 5. OAUTH AUTHORIZATION CODES (short-lived, single-use)
-- ============================================================================

CREATE TABLE bureau.oauth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES bureau.oauth_clients(client_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL CHECK (code_challenge_method = 'S256'),
  resource TEXT,
  scopes TEXT[] NOT NULL,
  agent_label TEXT,
  stream_ids UUID[],
  allow_create_streams BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_oauth_codes_expires ON bureau.oauth_codes(expires_at);
COMMENT ON TABLE bureau.oauth_codes IS 'OAuth authorization codes (60s TTL, single-use, bound to PKCE challenge).';

-- ============================================================================
-- 6. DEVICE CODES (RFC 8628 device flow for scripts/CLIs)
-- ============================================================================

CREATE TABLE bureau.oauth_device_codes (
  device_code_hash TEXT PRIMARY KEY,
  user_code TEXT UNIQUE NOT NULL,
  client_name TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
  scopes TEXT[] NOT NULL,
  agent_label TEXT,
  stream_ids UUID[],
  allow_create_streams BOOLEAN DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'consumed')),
  interval INTEGER NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_device_codes_user_code ON bureau.oauth_device_codes(user_code);
CREATE INDEX idx_device_codes_expires ON bureau.oauth_device_codes(expires_at);
COMMENT ON TABLE bureau.oauth_device_codes IS 'Device codes for script/CLI OAuth (user enters user_code on Bureau consent screen).';

-- ============================================================================
-- 7. AGENT SEEN (optional: track self-declared agent names for one-click linking)
-- ============================================================================

CREATE TABLE bureau.agent_seen (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
  grant_id UUID NOT NULL REFERENCES bureau.oauth_grants(id) ON DELETE CASCADE,
  agent_label TEXT NOT NULL,
  agent_ref TEXT,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  linked BOOLEAN DEFAULT FALSE,
  UNIQUE(grant_id, agent_label)
);

CREATE INDEX idx_agent_seen_workspace ON bureau.agent_seen(workspace_id);
CREATE INDEX idx_agent_seen_grant ON bureau.agent_seen(grant_id);
COMMENT ON TABLE bureau.agent_seen IS 'First-seen agent names from tool calls, awaiting "link this agent?" approval.';

-- ============================================================================
-- 8. MODIFY INGEST_TOKENS TO SUPPORT AGENT LINKS
-- ============================================================================

-- Add columns for agent_link tracking
ALTER TABLE bureau.ingest_tokens 
  ADD COLUMN kind TEXT DEFAULT 'legacy' CHECK (kind IN ('legacy', 'agent_link')),
  ADD COLUMN agent_link_id UUID REFERENCES bureau.agent_links(id) ON DELETE CASCADE;

CREATE INDEX idx_ingest_tokens_agent_link ON bureau.ingest_tokens(agent_link_id) WHERE agent_link_id IS NOT NULL;
COMMENT ON COLUMN bureau.ingest_tokens.kind IS 'Token type: legacy (workspace-wide) or agent_link (scoped to agent).';
COMMENT ON COLUMN bureau.ingest_tokens.agent_link_id IS 'If kind=agent_link, the linked agent (hidden token for FK).';

-- ============================================================================
-- 9. RLS POLICIES
-- ============================================================================

-- OAuth grants: users see only their own grants
ALTER TABLE bureau.oauth_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY oauth_grants_user_read ON bureau.oauth_grants
  FOR SELECT
  USING (user_id = auth.uid() AND workspace_id IN (SELECT bureau.user_workspaces()));

CREATE POLICY oauth_grants_user_insert ON bureau.oauth_grants
  FOR INSERT
  WITH CHECK (user_id = auth.uid() AND workspace_id IN (SELECT bureau.user_workspaces()));

CREATE POLICY oauth_grants_user_update ON bureau.oauth_grants
  FOR UPDATE
  USING (user_id = auth.uid() AND workspace_id IN (SELECT bureau.user_workspaces()));

-- Agent links: workspace-scoped
ALTER TABLE bureau.agent_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_links_workspace ON bureau.agent_links
  FOR ALL
  USING (workspace_id IN (SELECT bureau.user_workspaces()));

-- Agent seen: workspace-scoped
ALTER TABLE bureau.agent_seen ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_seen_workspace ON bureau.agent_seen
  FOR ALL
  USING (workspace_id IN (SELECT bureau.user_workspaces()));

-- OAuth clients: global read, allow insert for DCR
ALTER TABLE bureau.oauth_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY oauth_clients_read ON bureau.oauth_clients
  FOR SELECT
  USING (true);

CREATE POLICY oauth_clients_insert ON bureau.oauth_clients
  FOR INSERT
  WITH CHECK (registration = 'dcr'); -- Only DCR clients can self-register

-- Secret-bearing tables: NO POLICY for bureau_app, touched only via SECURITY DEFINER
ALTER TABLE bureau.oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE bureau.oauth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bureau.oauth_device_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bureau.oauth_tokens FROM PUBLIC;
REVOKE ALL ON bureau.oauth_codes FROM PUBLIC;
REVOKE ALL ON bureau.oauth_device_codes FROM PUBLIC;

-- ============================================================================
-- 10. SECURITY DEFINER FUNCTIONS
-- ============================================================================

-- Function to resolve OAuth access token or legacy ingest token
CREATE OR REPLACE FUNCTION bureau.resolve_credential(
  p_token TEXT
) RETURNS TABLE (
  workspace_id UUID,
  user_id UUID,
  user_email TEXT,
  token_id UUID,
  agent_link_id UUID,
  allowed_stream_ids UUID[],
  allow_create_streams BOOLEAN,
  scopes TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, extensions
AS $$
#variable_conflict use_column
DECLARE
  v_token_hash TEXT;
  v_prefix TEXT;
BEGIN
  -- Check prefix to route to correct table
  v_prefix := substring(p_token from 1 for 10);
  
  IF v_prefix = 'bureau_at_' THEN
    -- OAuth access token
    v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
    
    RETURN QUERY
    SELECT 
      g.workspace_id,
      g.user_id,
      wm.email as user_email,
      NULL::UUID as token_id,
      al.id as agent_link_id,
      al.stream_ids as allowed_stream_ids,
      al.allow_create_streams,
      al.scopes
    FROM bureau.oauth_tokens t
    JOIN bureau.oauth_grants g ON g.id = t.grant_id
    JOIN bureau.agent_links al ON al.grant_id = g.id
    JOIN auth.users au ON au.id = g.user_id
    LEFT JOIN bureau.workspace_members wm ON wm.workspace_id = g.workspace_id AND wm.user_id = g.user_id
    WHERE t.token_hash = v_token_hash
      AND t.kind = 'access'
      AND t.expires_at > NOW()
      AND t.revoked_at IS NULL
      AND g.status = 'active'
      AND al.status = 'active'
    LIMIT 1;
    
    -- Update last_seen_at
    UPDATE bureau.oauth_grants 
    SET last_seen_at = NOW() 
    WHERE id IN (
      SELECT g.id FROM bureau.oauth_tokens t
      JOIN bureau.oauth_grants g ON g.id = t.grant_id
      WHERE t.token_hash = v_token_hash
    );
    
  ELSE
    -- Legacy ingest token (bureau_...)
    v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
    
    RETURN QUERY
    SELECT 
      t.workspace_id,
      w.created_by as user_id,
      wm.email as user_email,
      t.id as token_id,
      NULL::UUID as agent_link_id,
      NULL::UUID[] as allowed_stream_ids,
      TRUE as allow_create_streams,
      ARRAY['ingest:write']::TEXT[] as scopes
    FROM bureau.ingest_tokens t
    JOIN bureau.workspaces w ON w.id = t.workspace_id
    JOIN bureau.workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = w.created_by
    WHERE t.token_hash = v_token_hash
      AND t.revoked_at IS NULL;
      
    -- Update last_used_at
    UPDATE bureau.ingest_tokens 
    SET last_used_at = NOW() 
    WHERE token_hash = v_token_hash;
  END IF;
END;
$$;

COMMENT ON FUNCTION bureau.resolve_credential IS 
  'Resolves OAuth access token or legacy ingest token. Returns workspace, user, agent_link, stream allowlist. SECURITY DEFINER.';

REVOKE ALL ON FUNCTION bureau.resolve_credential(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bureau.resolve_credential(TEXT) TO bureau_app;

-- Function to mint OAuth tokens
CREATE OR REPLACE FUNCTION bureau.mint_oauth_tokens(
  p_grant_id UUID,
  p_access_token_hash TEXT,
  p_access_token_prefix TEXT,
  p_refresh_token_hash TEXT,
  p_refresh_token_prefix TEXT,
  p_family_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, extensions
AS $$
BEGIN
  -- Insert access token (1 hour)
  INSERT INTO bureau.oauth_tokens (
    token_hash, token_prefix, kind, grant_id, expires_at
  ) VALUES (
    p_access_token_hash, p_access_token_prefix, 'access', p_grant_id, NOW() + INTERVAL '1 hour'
  );
  
  -- Insert refresh token (60 days sliding)
  INSERT INTO bureau.oauth_tokens (
    token_hash, token_prefix, kind, grant_id, family_id, expires_at
  ) VALUES (
    p_refresh_token_hash, p_refresh_token_prefix, 'refresh', p_grant_id, p_family_id, NOW() + INTERVAL '60 days'
  );
END;
$$;

REVOKE ALL ON FUNCTION bureau.mint_oauth_tokens FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bureau.mint_oauth_tokens TO bureau_app;

-- Function to rotate refresh token
CREATE OR REPLACE FUNCTION bureau.rotate_refresh_token(
  p_old_token_hash TEXT,
  p_new_token_hash TEXT,
  p_new_token_prefix TEXT
) RETURNS TABLE (
  grant_id UUID,
  family_id UUID,
  workspace_id UUID,
  user_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, extensions
AS $$
#variable_conflict use_column
DECLARE
  v_old_token RECORD;
BEGIN
  -- Check old refresh token
  SELECT t.grant_id, t.family_id, t.used_at, t.revoked_at, t.expires_at,
         g.workspace_id, g.user_id, g.status
  INTO v_old_token
  FROM bureau.oauth_tokens t
  JOIN bureau.oauth_grants g ON g.id = t.grant_id
  WHERE t.token_hash = p_old_token_hash
    AND t.kind = 'refresh';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_REFRESH_TOKEN';
  END IF;
  
  IF v_old_token.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'TOKEN_REVOKED';
  END IF;
  
  IF v_old_token.expires_at < NOW() THEN
    RAISE EXCEPTION 'TOKEN_EXPIRED';
  END IF;
  
  IF v_old_token.status != 'active' THEN
    RAISE EXCEPTION 'GRANT_REVOKED';
  END IF;
  
  -- Reuse detection: if already used, revoke entire family
  IF v_old_token.used_at IS NOT NULL THEN
    UPDATE bureau.oauth_tokens
    SET revoked_at = NOW()
    WHERE family_id = v_old_token.family_id;
    
    UPDATE bureau.oauth_grants
    SET status = 'needs_reauth',
        revoked_reason = 'Refresh token reuse detected'
    WHERE id = v_old_token.grant_id;
    
    RAISE EXCEPTION 'REFRESH_TOKEN_REUSED';
  END IF;
  
  -- Mark old token as used
  UPDATE bureau.oauth_tokens
  SET used_at = NOW()
  WHERE token_hash = p_old_token_hash;
  
  -- Issue new refresh token
  INSERT INTO bureau.oauth_tokens (
    token_hash, token_prefix, kind, grant_id, family_id, expires_at
  ) VALUES (
    p_new_token_hash, p_new_token_prefix, 'refresh', 
    v_old_token.grant_id, v_old_token.family_id, NOW() + INTERVAL '60 days'
  );
  
  -- Return grant info for access token minting
  RETURN QUERY
  SELECT v_old_token.grant_id, v_old_token.family_id, 
         v_old_token.workspace_id, v_old_token.user_id;
END;
$$;

REVOKE ALL ON FUNCTION bureau.rotate_refresh_token FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bureau.rotate_refresh_token TO bureau_app;

-- ============================================================================
-- 11. SEED STATIC CLIENTS (ChatGPT, Grok Bot, Cursor)
-- ============================================================================

INSERT INTO bureau.oauth_clients (client_id, client_name, redirect_uris, registration, vendor, verified) VALUES
  ('chatgpt-mcp', 'ChatGPT Custom MCP', ARRAY['https://chatgpt.com/aip/oauth/callback', 'https://chat.openai.com/aip/oauth/callback'], 'static', 'openai', true),
  ('grokbot-mcp', 'Grok Bot MCP Connector', ARRAY['https://www.cursor.com/agents/mcp/oauth/callback'], 'static', 'grokbot', true),
  ('cursor-mcp', 'Cursor MCP', ARRAY['https://www.cursor.com/agents/mcp/oauth/callback', 'http://localhost:8787/callback'], 'static', 'cursor', true)
ON CONFLICT (client_id) DO NOTHING;

COMMENT ON TABLE bureau.oauth_clients IS 'Seed data: ChatGPT, Grok Bot, Cursor static clients.';
