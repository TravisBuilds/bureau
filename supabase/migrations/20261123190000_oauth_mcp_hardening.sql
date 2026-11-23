-- OAuth MCP Hardening Migration
-- Remove direct table access from bureau_app, enforce SECURITY DEFINER functions only

BEGIN;

-- 1. Delete grokbot-mcp seed client (had Cursor's redirect URI, now incorrect)
DELETE FROM bureau.oauth_clients WHERE client_id = 'grokbot-mcp';

-- 2. Create SECURITY DEFINER functions for oauth_codes access

CREATE OR REPLACE FUNCTION bureau.store_auth_code(
  p_code_hash text,
  p_client_id text,
  p_user_id uuid,
  p_workspace_id uuid,
  p_redirect_uri text,
  p_code_challenge text,
  p_code_challenge_method text,
  p_resource text,
  p_scopes text[],
  p_agent_label text,
  p_stream_ids text[],
  p_allow_create_streams boolean,
  p_expires_at timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
BEGIN
  INSERT INTO oauth_codes (
    code_hash, client_id, user_id, workspace_id, redirect_uri,
    code_challenge, code_challenge_method, resource, scopes,
    agent_label, stream_ids, allow_create_streams, expires_at
  ) VALUES (
    p_code_hash, p_client_id, p_user_id, p_workspace_id, p_redirect_uri,
    p_code_challenge, p_code_challenge_method, p_resource, p_scopes,
    p_agent_label, p_stream_ids, p_allow_create_streams, p_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION bureau.consume_auth_code(
  p_code_hash text,
  p_client_id text
) RETURNS TABLE (
  user_id uuid,
  workspace_id uuid,
  client_id text,
  redirect_uri text,
  code_challenge text,
  code_challenge_method text,
  resource text,
  scopes text[],
  agent_label text,
  stream_ids text[],
  allow_create_streams boolean,
  consumed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
DECLARE
  v_code_row RECORD;
BEGIN
  -- Select and mark consumed atomically
  UPDATE oauth_codes
  SET consumed_at = now()
  WHERE code_hash = p_code_hash
    AND client_id = p_client_id
    AND consumed_at IS NULL
    AND expires_at > now()
  RETURNING 
    oauth_codes.user_id,
    oauth_codes.workspace_id,
    oauth_codes.client_id,
    oauth_codes.redirect_uri,
    oauth_codes.code_challenge,
    oauth_codes.code_challenge_method,
    oauth_codes.resource,
    oauth_codes.scopes,
    oauth_codes.agent_label,
    oauth_codes.stream_ids,
    oauth_codes.allow_create_streams,
    oauth_codes.consumed_at
  INTO v_code_row;
  
  IF v_code_row IS NULL THEN
    RETURN;
  END IF;
  
  RETURN QUERY SELECT 
    v_code_row.user_id,
    v_code_row.workspace_id,
    v_code_row.client_id,
    v_code_row.redirect_uri,
    v_code_row.code_challenge,
    v_code_row.code_challenge_method,
    v_code_row.resource,
    v_code_row.scopes,
    v_code_row.agent_label,
    v_code_row.stream_ids,
    v_code_row.allow_create_streams,
    v_code_row.consumed_at;
END;
$$;

-- 3. Create SECURITY DEFINER function for token revocation (with ownership checks)

CREATE OR REPLACE FUNCTION bureau.revoke_oauth_token(
  p_token text,
  p_user_id uuid,
  p_workspace_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
DECLARE
  v_revoked boolean := false;
BEGIN
  -- Revoke only if caller owns the token (workspace + user match)
  UPDATE oauth_tokens
  SET revoked_at = now()
  WHERE (token = p_token OR refresh_token = p_token)
    AND user_id = p_user_id
    AND workspace_id = p_workspace_id
    AND revoked_at IS NULL;
  
  GET DIAGNOSTICS v_revoked = ROW_COUNT;
  RETURN v_revoked > 0;
END;
$$;

-- 4. Create SECURITY DEFINER functions for device code flow

CREATE OR REPLACE FUNCTION bureau.start_device_code(
  p_device_code_hash text,
  p_user_code text,
  p_client_name text,
  p_scopes text[],
  p_interval integer,
  p_expires_at timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
BEGIN
  INSERT INTO oauth_device_codes (
    device_code_hash, user_code, client_name, scopes, interval, expires_at
  ) VALUES (
    p_device_code_hash, p_user_code, p_client_name, p_scopes, p_interval, p_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION bureau.poll_device_code(
  p_device_code_hash text
) RETURNS TABLE (
  user_id uuid,
  workspace_id uuid,
  client_name text,
  scopes text[],
  status text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dc.user_id,
    dc.workspace_id,
    dc.client_name,
    dc.scopes,
    dc.status,
    dc.expires_at
  FROM oauth_device_codes dc
  WHERE dc.device_code_hash = p_device_code_hash
    AND dc.expires_at > now();
END;
$$;

CREATE OR REPLACE FUNCTION bureau.consume_device_code(
  p_device_code_hash text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
BEGIN
  UPDATE oauth_device_codes
  SET status = 'consumed'
  WHERE device_code_hash = p_device_code_hash;
END;
$$;

-- 4b. Create helper function to mint access token (for refresh rotation)

CREATE OR REPLACE FUNCTION bureau.mint_access_token(
  p_grant_id uuid,
  p_token_hash text,
  p_token_prefix text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
BEGIN
  INSERT INTO oauth_tokens (token_hash, token_prefix, kind, grant_id, expires_at)
  VALUES (p_token_hash, p_token_prefix, 'access', p_grant_id, now() + interval '1 hour');
END;
$$;

-- 5. Grant EXECUTE on all functions to bureau_app only, revoke from PUBLIC

REVOKE ALL ON FUNCTION bureau.store_auth_code FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bureau.store_auth_code TO bureau_app;

REVOKE ALL ON FUNCTION bureau.consume_auth_code FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bureau.consume_auth_code TO bureau_app;

REVOKE ALL ON FUNCTION bureau.revoke_oauth_token FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bureau.revoke_oauth_token TO bureau_app;

REVOKE ALL ON FUNCTION bureau.start_device_code FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bureau.start_device_code TO bureau_app;

REVOKE ALL ON FUNCTION bureau.poll_device_code FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bureau.poll_device_code TO bureau_app;

REVOKE ALL ON FUNCTION bureau.consume_device_code FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bureau.consume_device_code TO bureau_app;

REVOKE ALL ON FUNCTION bureau.mint_access_token FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bureau.mint_access_token TO bureau_app;

-- 6. REVOKE ALL table privileges on secret-bearing tables from bureau_app and PUBLIC

REVOKE ALL ON bureau.oauth_codes FROM bureau_app, PUBLIC;
REVOKE ALL ON bureau.oauth_tokens FROM bureau_app, PUBLIC;
REVOKE ALL ON bureau.oauth_device_codes FROM bureau_app, PUBLIC;

COMMIT;
