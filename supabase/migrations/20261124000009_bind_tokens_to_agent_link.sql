-- Bind OAuth tokens to the agent link they were issued for.
-- Date: 2026-11-24
-- Why: one grant per (workspace, user, client) can carry several agent links (e.g. two CLI bots on the
-- device flow). resolve_credential joined any link of the grant with LIMIT 1, so a second bot's token
-- could resolve to the first bot's label and stream allowlist.

SET search_path TO bureau, extensions;

ALTER TABLE bureau.oauth_tokens
  ADD COLUMN IF NOT EXISTS agent_link_id UUID REFERENCES bureau.agent_links(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_agent_link ON bureau.oauth_tokens(agent_link_id) WHERE agent_link_id IS NOT NULL;

-- Mint an access + refresh pair bound to one agent link of the grant.
CREATE OR REPLACE FUNCTION bureau.mint_link_tokens(
  p_grant_id UUID,
  p_agent_link_id UUID,
  p_access_token_hash TEXT,
  p_access_token_prefix TEXT,
  p_refresh_token_hash TEXT,
  p_refresh_token_prefix TEXT,
  p_family_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM bureau.agent_links WHERE id = p_agent_link_id AND grant_id = p_grant_id) THEN
    RAISE EXCEPTION 'AGENT_LINK_GRANT_MISMATCH';
  END IF;
  INSERT INTO bureau.oauth_tokens (token_hash, token_prefix, kind, grant_id, agent_link_id, expires_at)
  VALUES (p_access_token_hash, p_access_token_prefix, 'access', p_grant_id, p_agent_link_id, NOW() + INTERVAL '1 hour');
  INSERT INTO bureau.oauth_tokens (token_hash, token_prefix, kind, grant_id, agent_link_id, family_id, expires_at)
  VALUES (p_refresh_token_hash, p_refresh_token_prefix, 'refresh', p_grant_id, p_agent_link_id, p_family_id, NOW() + INTERVAL '60 days');
END;
$$;
REVOKE ALL ON FUNCTION bureau.mint_link_tokens(UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION bureau.mint_link_tokens(UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID) TO bureau_app;

-- Rotate a refresh token (reuse detection stays in rotate_refresh_token) and mint the new access token,
-- both carrying the old token's agent link.
CREATE OR REPLACE FUNCTION bureau.rotate_link_refresh_token(
  p_old_token_hash TEXT,
  p_new_refresh_hash TEXT,
  p_new_refresh_prefix TEXT,
  p_new_access_hash TEXT,
  p_new_access_prefix TEXT
) RETURNS TABLE(grant_id UUID, family_id UUID, workspace_id UUID, user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_link UUID;
  r RECORD;
BEGIN
  SELECT t.agent_link_id INTO v_link FROM bureau.oauth_tokens t
  WHERE t.token_hash = p_old_token_hash AND t.kind = 'refresh';

  SELECT * INTO r FROM bureau.rotate_refresh_token(p_old_token_hash, p_new_refresh_hash, p_new_refresh_prefix);

  UPDATE bureau.oauth_tokens SET agent_link_id = v_link WHERE token_hash = p_new_refresh_hash;
  INSERT INTO bureau.oauth_tokens (token_hash, token_prefix, kind, grant_id, agent_link_id, expires_at)
  VALUES (p_new_access_hash, p_new_access_prefix, 'access', r.grant_id, v_link, NOW() + INTERVAL '1 hour');

  RETURN QUERY SELECT r.grant_id, r.family_id, r.workspace_id, r.user_id;
END;
$$;
REVOKE ALL ON FUNCTION bureau.rotate_link_refresh_token(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION bureau.rotate_link_refresh_token(TEXT, TEXT, TEXT, TEXT, TEXT) TO bureau_app;

-- resolve_credential: same signature and output; access tokens now resolve to their own link,
-- membership must be active, and ordering is deterministic.
CREATE OR REPLACE FUNCTION bureau.resolve_credential(p_token text)
 RETURNS TABLE(workspace_id uuid, user_id uuid, user_email text, token_id uuid, agent_link_id uuid, allowed_stream_ids uuid[], allow_create_streams boolean, scopes text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'bureau', 'extensions', 'pg_temp'
AS $function$
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
    -- A token bound to an agent link resolves to exactly that link; older unbound tokens fall back to the grant's first link
    JOIN bureau.agent_links al ON al.grant_id = g.id AND (t.agent_link_id IS NULL OR al.id = t.agent_link_id)
    JOIN auth.users au ON au.id = g.user_id
    JOIN bureau.workspace_members wm ON wm.workspace_id = g.workspace_id AND wm.user_id = g.user_id AND wm.removed_at IS NULL
    WHERE t.token_hash = v_token_hash
      AND t.kind = 'access'
      AND t.expires_at > NOW()
      AND t.revoked_at IS NULL
      AND g.status = 'active'
      AND al.status = 'active'
    ORDER BY al.created_at
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
$function$;

REVOKE ALL ON FUNCTION bureau.resolve_credential(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION bureau.resolve_credential(TEXT) TO bureau_app;
