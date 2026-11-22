-- Migration: Token hashing for security
-- Date: 2026-11-22
-- Purpose: Store SHA-256 hash of tokens, not plaintext
-- No backfill needed (no tokens exist in prod yet)

-- ============================================================================
-- ALTER INGEST_TOKENS TABLE
-- ============================================================================

-- Add new columns for hash-based storage
ALTER TABLE bureau.ingest_tokens 
  ADD COLUMN token_hash TEXT,
  ADD COLUMN token_prefix TEXT;

-- Drop old plaintext token column (no data to preserve)
ALTER TABLE bureau.ingest_tokens 
  DROP COLUMN IF EXISTS token,
  DROP COLUMN IF EXISTS stream_id;  -- Also remove unused stream_id column

-- Make hash required for new tokens
ALTER TABLE bureau.ingest_tokens 
  ALTER COLUMN token_hash SET NOT NULL,
  ALTER COLUMN token_prefix SET NOT NULL;

-- Index on hash for fast lookup
CREATE INDEX idx_ingest_tokens_hash ON bureau.ingest_tokens(token_hash);

-- ============================================================================
-- UPDATE resolve_ingest_token FUNCTION
-- ============================================================================

-- Parameter name changes (token_text -> p_token), and CREATE OR REPLACE cannot rename
-- input parameters (42P13), so drop the old signature first.
DROP FUNCTION IF EXISTS bureau.resolve_ingest_token(TEXT);

CREATE FUNCTION bureau.resolve_ingest_token(
  p_token TEXT
) RETURNS TABLE (
  workspace_id UUID,
  user_id UUID,
  user_email TEXT,
  token_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, extensions
AS $$
#variable_conflict use_column
DECLARE
  v_token_hash TEXT;
BEGIN
  -- Compute SHA-256 hash of provided token (schema-qualified pgcrypto)
  v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  
  -- Look up by hash (not plaintext)
  RETURN QUERY
  SELECT 
    t.workspace_id,
    w.created_by as user_id,
    wm.email as user_email,
    t.id as token_id
  FROM bureau.ingest_tokens t
  JOIN bureau.workspaces w ON w.id = t.workspace_id
  JOIN bureau.workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = w.created_by
  WHERE t.token_hash = v_token_hash
    AND t.revoked_at IS NULL;
  
  -- Update last_used_at
  UPDATE bureau.ingest_tokens 
  SET last_used_at = NOW() 
  WHERE token_hash = v_token_hash;
END;
$$;

COMMENT ON FUNCTION bureau.resolve_ingest_token IS 
  'Validates ingest token by hash comparison. Returns workspace, user, email. SECURITY DEFINER to bypass RLS.';

REVOKE ALL ON FUNCTION bureau.resolve_ingest_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bureau.resolve_ingest_token(TEXT) TO bureau_app;
