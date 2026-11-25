-- Passive activity logging, Phase 1 (foundation)
-- Date: 2026-11-25
-- Purpose: every request an employee makes of their connected AI is logged (by the AI calling
-- bureau_log_activity), encrypted in the app with AES-256-GCM, kept 30 days, readable only by
-- the employee and workspace owners/admins. Separate from team:read (check-ins stay team-wide).
--
-- Security invariants kept:
--   * bureau_app gets no USAGE on auth, no role membership, nothing on oauth_tokens/oauth_codes/
--     oauth_device_codes. New tables get the schema's default bureau_app DML grants, and RLS
--     decides what each user sees (bureau_app does not own the tables).
--   * Content columns hold ciphertext only ("v1:<iv>:<tag>:<ct>", base64). The key lives in the
--     app env (BUREAU_ACTIVITY_ENCRYPTION_KEY), never in the database.

SET search_path TO bureau, extensions;

-- ---------------------------------------------------------------------------
-- Helper: is the current user (auth.uid()) an active owner/admin of a workspace?
-- SECURITY DEFINER so policies don't depend on workspace_members' own RLS.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bureau.is_workspace_leader(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM bureau.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = auth.uid()
      AND wm.removed_at IS NULL
      AND wm.role::text IN ('owner', 'admin')
  );
$$;
REVOKE ALL ON FUNCTION bureau.is_workspace_leader(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bureau.is_workspace_leader(UUID) TO bureau_app;

CREATE OR REPLACE FUNCTION bureau.is_active_member(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM bureau.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = auth.uid()
      AND wm.removed_at IS NULL
  );
$$;
REVOKE ALL ON FUNCTION bureau.is_active_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bureau.is_active_member(UUID) TO bureau_app;

-- ---------------------------------------------------------------------------
-- 1. Notice acknowledgements (BC PIPA s. 10 / 13(3): notify before collecting)
-- ---------------------------------------------------------------------------
CREATE TABLE bureau.activity_consents (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  policy_version TEXT NOT NULL CHECK (length(policy_version) BETWEEN 1 AND 40),
  source TEXT NOT NULL CHECK (source IN ('oauth_consent', 'device_consent', 'web')),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  UNIQUE (workspace_id, user_id, policy_version)
);
CREATE INDEX idx_activity_consents_user ON bureau.activity_consents(workspace_id, user_id);
COMMENT ON TABLE bureau.activity_consents IS 'Employee acknowledgement of the AI activity logging notice (per policy version). Logging is refused without an active row.';

ALTER TABLE bureau.activity_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY activity_consents_select ON bureau.activity_consents
  FOR SELECT USING (user_id = auth.uid() OR bureau.is_workspace_leader(workspace_id));
CREATE POLICY activity_consents_insert ON bureau.activity_consents
  FOR INSERT WITH CHECK (user_id = auth.uid() AND bureau.is_active_member(workspace_id));
CREATE POLICY activity_consents_update ON bureau.activity_consents
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- No DELETE policy: the acknowledgement history is kept (revoke sets revoked_at).

-- ---------------------------------------------------------------------------
-- 2. Activity log (encrypted content)
-- ---------------------------------------------------------------------------
CREATE TABLE bureau.activity_logs (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clone_id UUID REFERENCES bureau.digital_clones(id) ON DELETE SET NULL,
  agent_link_id UUID REFERENCES bureau.agent_links(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'mcp_tool' CHECK (source IN ('mcp_tool', 'extension', 'gateway', 'compliance_api')),
  vendor TEXT CHECK (vendor IS NULL OR length(vendor) <= 40),
  agent_label TEXT CHECK (agent_label IS NULL OR length(agent_label) <= 100),
  kind TEXT NOT NULL DEFAULT 'request' CHECK (kind IN ('request', 'action')),
  request_enc TEXT,              -- AES-256-GCM ciphertext of what the employee asked
  detail_enc TEXT,               -- AES-256-GCM ciphertext of optional context / action taken
  key_version SMALLINT NOT NULL DEFAULT 1,
  secrets_scrubbed INT NOT NULL DEFAULT 0 CHECK (secrets_scrubbed >= 0),
  conversation_ref TEXT CHECK (conversation_ref IS NULL OR length(conversation_ref) <= 200),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hidden_at TIMESTAMPTZ,         -- set when the employee marks it personal (content is wiped)
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  -- Hidden rows never keep content; visible rows always have a request.
  CONSTRAINT activity_logs_hidden_has_no_content CHECK (
    (hidden_at IS NOT NULL AND request_enc IS NULL AND detail_enc IS NULL)
    OR (hidden_at IS NULL AND request_enc IS NOT NULL)
  ),
  CONSTRAINT activity_logs_retention_max_90d CHECK (expires_at <= received_at + INTERVAL '90 days')
);
CREATE INDEX idx_activity_logs_ws_time ON bureau.activity_logs(workspace_id, occurred_at DESC);
CREATE INDEX idx_activity_logs_ws_user_time ON bureau.activity_logs(workspace_id, user_id, occurred_at DESC);
CREATE INDEX idx_activity_logs_expires ON bureau.activity_logs(expires_at);
COMMENT ON TABLE bureau.activity_logs IS 'Passive AI activity log. Content is app-encrypted (AES-256-GCM). Readable by the employee and workspace owners/admins only; 30-day retention.';

ALTER TABLE bureau.activity_logs ENABLE ROW LEVEL SECURITY;

-- Own rows, or any row in a workspace where you are an active owner/admin. NOT team:read:
-- regular members never see teammates' requests.
CREATE POLICY activity_logs_select ON bureau.activity_logs
  FOR SELECT USING (user_id = auth.uid() OR bureau.is_workspace_leader(workspace_id));

-- Only for yourself, only as an active member, only with an active notice acknowledgement.
CREATE POLICY activity_logs_insert ON bureau.activity_logs
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND bureau.is_active_member(workspace_id)
    AND EXISTS (
      SELECT 1 FROM bureau.activity_consents c
      WHERE c.workspace_id = activity_logs.workspace_id
        AND c.user_id = auth.uid()
        AND c.revoked_at IS NULL
    )
  );

-- Owners of a row may hide (wipe) or delete it. No one else may change anything.
CREATE POLICY activity_logs_update ON bureau.activity_logs
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY activity_logs_delete ON bureau.activity_logs
  FOR DELETE USING (user_id = auth.uid());

-- Updates may only hide: identity, timing and source columns are frozen, and a hidden row
-- can never be un-hidden or refilled.
CREATE OR REPLACE FUNCTION bureau.activity_logs_guard_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = bureau, pg_temp
AS $$
BEGIN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.clone_id IS DISTINCT FROM OLD.clone_id
     OR NEW.agent_link_id IS DISTINCT FROM OLD.agent_link_id
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
     OR NEW.received_at IS DISTINCT FROM OLD.received_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'activity_logs: only hiding is allowed';
  END IF;
  IF OLD.hidden_at IS NOT NULL AND NEW.hidden_at IS DISTINCT FROM OLD.hidden_at THEN
    RAISE EXCEPTION 'activity_logs: a hidden entry cannot be un-hidden';
  END IF;
  IF NEW.hidden_at IS NULL AND (NEW.request_enc IS DISTINCT FROM OLD.request_enc OR NEW.detail_enc IS DISTINCT FROM OLD.detail_enc) THEN
    RAISE EXCEPTION 'activity_logs: content cannot be edited';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER activity_logs_guard_update
  BEFORE UPDATE ON bureau.activity_logs
  FOR EACH ROW EXECUTE FUNCTION bureau.activity_logs_guard_update();

-- ---------------------------------------------------------------------------
-- 3. Retention: delete expired rows (called daily by /api/cron/activity-retention).
-- SECURITY DEFINER because RLS would otherwise limit the delete to the caller's own rows.
-- It only ever deletes rows past expires_at, so it is safe to expose to bureau_app.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bureau.purge_expired_activity()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM bureau.activity_logs WHERE expires_at <= NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION bureau.purge_expired_activity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bureau.purge_expired_activity() TO bureau_app;

-- Explicit table grants (the schema default already covers bureau_app; restated for clarity).
GRANT SELECT, INSERT, UPDATE, DELETE ON bureau.activity_logs TO bureau_app;
GRANT SELECT, INSERT, UPDATE ON bureau.activity_consents TO bureau_app;
REVOKE DELETE ON bureau.activity_consents FROM bureau_app;
