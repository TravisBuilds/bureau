-- Fix ingest_log to work with OAuth tokens
-- Date: 2026-11-24
-- Purpose: Make token_id nullable, add agent_link_id for OAuth tokens

SET search_path TO bureau, extensions;

-- Make token_id nullable and add agent_link_id
ALTER TABLE bureau.ingest_log
  ALTER COLUMN token_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS agent_link_id UUID REFERENCES bureau.agent_links(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ingest_log_agent_link ON bureau.ingest_log(agent_link_id);

COMMENT ON COLUMN bureau.ingest_log.token_id IS 'Legacy ingest token ID (nullable for OAuth tokens)';
COMMENT ON COLUMN bureau.ingest_log.agent_link_id IS 'OAuth agent link ID (nullable for legacy tokens)';

-- Update insert_ingest_log function to accept agent_link_id
CREATE OR REPLACE FUNCTION bureau.insert_ingest_log(
  p_workspace_id UUID,
  p_token_id UUID,
  p_agent_link_id UUID,
  p_payload JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO bureau.ingest_log (workspace_id, token_id, agent_link_id, payload, status)
  VALUES (p_workspace_id, p_token_id, p_agent_link_id, p_payload, 'approved')
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

REVOKE ALL ON FUNCTION bureau.insert_ingest_log(UUID, UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION bureau.insert_ingest_log(UUID, UUID, UUID, JSONB) TO bureau_app;
