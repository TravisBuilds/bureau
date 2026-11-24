-- OAuth Device Code Approval Functions
-- Secure device code approval workflow

BEGIN;

-- Function to lookup device code for approval page (read-only, no sensitive data)
CREATE OR REPLACE FUNCTION bureau.lookup_device_code(
  p_user_code text
) RETURNS TABLE (
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
    dc.client_name,
    dc.scopes,
    dc.status,
    dc.expires_at
  FROM oauth_device_codes dc
  WHERE dc.user_code = p_user_code
    AND dc.expires_at > now();
END;
$$;

REVOKE ALL ON FUNCTION bureau.lookup_device_code FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bureau.lookup_device_code TO bureau_app;

-- Function to approve device code (with workspace membership verification)
CREATE OR REPLACE FUNCTION bureau.approve_device_code(
  p_user_code text,
  p_user_id uuid,
  p_workspace_id uuid,
  p_agent_label text,
  p_stream_ids uuid[],
  p_allow_create_streams boolean
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
DECLARE
  v_is_member boolean;
  v_all_streams_owned boolean;
  v_row_count bigint;
BEGIN
  -- Verify user is a member of the workspace
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = p_user_id
  ) INTO v_is_member;
  
  IF NOT v_is_member THEN
    RAISE EXCEPTION 'USER_NOT_WORKSPACE_MEMBER';
  END IF;
  
  -- Verify all stream_ids belong to the workspace
  IF array_length(p_stream_ids, 1) > 0 THEN
    SELECT bool_and(workspace_id = p_workspace_id)
    FROM streams
    WHERE id = ANY(p_stream_ids)
    INTO v_all_streams_owned;
    
    IF NOT COALESCE(v_all_streams_owned, false) THEN
      RAISE EXCEPTION 'STREAM_NOT_IN_WORKSPACE';
    END IF;
  END IF;
  
  -- Update device code (only if pending and unexpired)
  UPDATE oauth_device_codes
  SET user_id = p_user_id,
      workspace_id = p_workspace_id,
      agent_label = p_agent_label,
      stream_ids = p_stream_ids,
      allow_create_streams = p_allow_create_streams,
      status = 'approved',
      approved_at = now()
  WHERE user_code = p_user_code
    AND status = 'pending'
    AND expires_at > now();
  
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION bureau.approve_device_code FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bureau.approve_device_code TO bureau_app;

COMMIT;
