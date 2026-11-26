-- Ground-truth activity (Phase A) + work units for management views (Phase B)
-- Date: 2026-11-26
-- Purpose: pull real work artifacts (GitHub, Vercel, Linear, Sentry, Google Drive, ElevenLabs,
-- Higgsfield) and AI requests into rule-classified "work units" (bureau.work_events), so leaders
-- see shipped/blocked work without relying on self-reports.
--
-- Security invariants kept:
--   * bureau_app gets no USAGE on auth, no role membership, nothing on oauth_tokens/oauth_codes/
--     oauth_device_codes.
--   * Nothing about a person is stored until they have an active acknowledgement of the notice
--     (bureau.activity_consents): the INSERT policies below require it, and the webhook actor
--     resolver only returns people who have accepted the current notice version.
--   * Content (titles/details) and integration secrets are app-encrypted (AES-256-GCM) with the
--     same BUREAU_ACTIVITY_ENCRYPTION_KEY; the database only ever sees ciphertext.
--   * Work units are readable by the person and workspace owners/admins only (not team:read).
--   * 30-day retention (90 days max), purged daily.

SET search_path TO bureau, extensions;

-- ---------------------------------------------------------------------------
-- 1. Integrations (one row per connected source)
-- ---------------------------------------------------------------------------
CREATE TABLE bureau.integrations (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('github', 'vercel', 'linear', 'sentry', 'google_drive', 'elevenlabs', 'higgsfield')),
  -- NULL = workspace-level source (webhooks, org API); set = a person's own account (their key / OAuth).
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '' CHECK (length(label) <= 100),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,       -- non-secret settings (project_map, folder id, ...)
  secret_enc TEXT,                                  -- webhook signing secret (ciphertext)
  credential_enc TEXT,                              -- API key / OAuth refresh token (ciphertext)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error')),
  sync_cursor TEXT CHECK (sync_cursor IS NULL OR length(sync_cursor) <= 500),
  last_event_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT CHECK (last_error IS NULL OR length(last_error) <= 300),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Personal sources must have an owner; webhook sources are workspace-level.
  CONSTRAINT integrations_owner_shape CHECK (
    (provider IN ('google_drive', 'elevenlabs') AND owner_user_id IS NOT NULL)
    OR (provider IN ('github', 'vercel', 'linear', 'sentry', 'higgsfield') AND owner_user_id IS NULL)
  )
);
CREATE INDEX idx_integrations_ws ON bureau.integrations(workspace_id, provider);
COMMENT ON TABLE bureau.integrations IS 'Connected ground-truth sources. Secrets are app-encrypted; APIs never return them.';

ALTER TABLE bureau.integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY integrations_select ON bureau.integrations
  FOR SELECT USING (bureau.is_workspace_leader(workspace_id) OR owner_user_id = auth.uid());
CREATE POLICY integrations_insert ON bureau.integrations
  FOR INSERT WITH CHECK (
    (owner_user_id IS NULL AND bureau.is_workspace_leader(workspace_id))
    OR (owner_user_id = auth.uid() AND bureau.is_active_member(workspace_id))
  );
CREATE POLICY integrations_update ON bureau.integrations
  FOR UPDATE USING (
    (owner_user_id IS NULL AND bureau.is_workspace_leader(workspace_id)) OR owner_user_id = auth.uid()
  ) WITH CHECK (
    (owner_user_id IS NULL AND bureau.is_workspace_leader(workspace_id)) OR owner_user_id = auth.uid()
  );
CREATE POLICY integrations_delete ON bureau.integrations
  FOR DELETE USING (
    (owner_user_id IS NULL AND bureau.is_workspace_leader(workspace_id)) OR owner_user_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 2. Identity links: which vendor account belongs to which Bureau person
-- ---------------------------------------------------------------------------
CREATE TABLE bureau.identity_links (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('github', 'vercel', 'linear', 'sentry', 'google_drive', 'elevenlabs', 'higgsfield')),
  external_id TEXT NOT NULL CHECK (length(external_id) BETWEEN 1 AND 200 AND external_id = lower(external_id)),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, provider, external_id)
);
CREATE INDEX idx_identity_links_user ON bureau.identity_links(workspace_id, user_id);

ALTER TABLE bureau.identity_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY identity_links_select ON bureau.identity_links
  FOR SELECT USING (user_id = auth.uid() OR bureau.is_workspace_leader(workspace_id));
-- You may link your own accounts; owners/admins may link anyone's (capture still needs that
-- person's own notice acknowledgement).
CREATE POLICY identity_links_insert ON bureau.identity_links
  FOR INSERT WITH CHECK (
    (user_id = auth.uid() AND bureau.is_active_member(workspace_id))
    OR bureau.is_workspace_leader(workspace_id)
  );
CREATE POLICY identity_links_delete ON bureau.identity_links
  FOR DELETE USING (user_id = auth.uid() OR bureau.is_workspace_leader(workspace_id));

-- ---------------------------------------------------------------------------
-- 3. Work units
-- ---------------------------------------------------------------------------
CREATE TABLE bureau.work_events (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  discipline TEXT CHECK (discipline IS NULL OR discipline IN ('engineering', 'design', 'studio')),
  project TEXT NOT NULL DEFAULT 'unassigned' CHECK (project ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  task_type TEXT NOT NULL CHECK (task_type IN ('build', 'debug', 'review', 'design', 'copy', 'generate_media', 'publish', 'plan', 'research', 'other')),
  tool TEXT NOT NULL CHECK (length(tool) BETWEEN 1 AND 40),
  tools TEXT[] NOT NULL DEFAULT '{}',
  artifact_link TEXT CHECK (artifact_link IS NULL OR (length(artifact_link) <= 500 AND artifact_link ~ '^https://')),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'shipped', 'rendered', 'blocked', 'abandoned', 'needs_review')),
  blocker_code TEXT CHECK (blocker_code IS NULL OR blocker_code IN ('retry_loop', 'stuck_keyword', 'deploy_failed', 'error_assigned', 'render_failures', 'review_wait')),
  effort JSONB NOT NULL DEFAULT '{}'::jsonb,       -- deterministic counters only (prompts, commits, renders, credits, chars)
  source_kinds TEXT[] NOT NULL DEFAULT '{}',
  confidence TEXT NOT NULL DEFAULT 'self_reported' CHECK (confidence IN ('verified_artifact', 'correlated', 'self_reported')),
  title_enc TEXT,                                   -- AES-256-GCM ciphertext
  detail_enc TEXT,                                  -- AES-256-GCM ciphertext (blocker note etc.)
  key_version SMALLINT NOT NULL DEFAULT 1,
  signal_count INT NOT NULL DEFAULT 0 CHECK (signal_count >= 0),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hidden_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  CONSTRAINT work_events_hidden_has_no_content CHECK (
    (hidden_at IS NOT NULL AND title_enc IS NULL AND detail_enc IS NULL AND artifact_link IS NULL)
    OR (hidden_at IS NULL AND title_enc IS NOT NULL)
  ),
  CONSTRAINT work_events_retention_max_90d CHECK (expires_at <= created_at + INTERVAL '90 days')
);
CREATE INDEX idx_work_events_ws_time ON bureau.work_events(workspace_id, last_seen_at DESC);
CREATE INDEX idx_work_events_ws_user_time ON bureau.work_events(workspace_id, user_id, last_seen_at DESC);
CREATE INDEX idx_work_events_stitch ON bureau.work_events(workspace_id, user_id, project, task_type, last_seen_at DESC);
CREATE INDEX idx_work_events_expires ON bureau.work_events(expires_at);
COMMENT ON TABLE bureau.work_events IS 'Rule-classified work units (prompts + ground-truth artifacts). Encrypted titles; readable by the person and owners/admins; 30-day retention.';

ALTER TABLE bureau.work_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_events_select ON bureau.work_events
  FOR SELECT USING (user_id = auth.uid() OR bureau.is_workspace_leader(workspace_id));
CREATE POLICY work_events_insert ON bureau.work_events
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND bureau.is_active_member(workspace_id)
    AND EXISTS (
      SELECT 1 FROM bureau.activity_consents c
      WHERE c.workspace_id = work_events.workspace_id AND c.user_id = auth.uid() AND c.revoked_at IS NULL
        -- Only a notice version that covers connected-tool capture (2026-11-26 or later; versions
        -- are ISO dates). The app additionally requires the exact current version.
        AND c.policy_version >= '2026-11-26'
    )
  );
CREATE POLICY work_events_update ON bureau.work_events
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY work_events_delete ON bureau.work_events
  FOR DELETE USING (user_id = auth.uid());

-- Identity and timing are frozen; a hidden unit can never be un-hidden or refilled.
CREATE OR REPLACE FUNCTION bureau.work_events_guard_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = bureau, pg_temp
AS $$
BEGIN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'work_events: identity, creation and expiry are fixed';
  END IF;
  IF OLD.hidden_at IS NOT NULL AND (NEW.hidden_at IS DISTINCT FROM OLD.hidden_at
       OR NEW.title_enc IS NOT NULL OR NEW.detail_enc IS NOT NULL OR NEW.artifact_link IS NOT NULL) THEN
    RAISE EXCEPTION 'work_events: a hidden unit cannot be changed';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;
CREATE TRIGGER work_events_guard_update
  BEFORE UPDATE ON bureau.work_events
  FOR EACH ROW EXECUTE FUNCTION bureau.work_events_guard_update();

-- ---------------------------------------------------------------------------
-- 4. Signals that make up a unit (dedupe + effort accounting). external_key is a SHA-256 of the
-- vendor's id, so no content is kept here even after a unit is hidden.
-- ---------------------------------------------------------------------------
CREATE TABLE bureau.work_event_sources (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  work_event_id UUID NOT NULL REFERENCES bureau.work_events(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (length(provider) BETWEEN 1 AND 40),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('webhook_truth', 'api_sync', 'agent_mcp', 'heartbeat')),
  external_key TEXT NOT NULL CHECK (external_key ~ '^[0-9a-f]{64}$'),
  activity_log_id UUID REFERENCES bureau.activity_logs(id) ON DELETE CASCADE,
  effort_delta JSONB NOT NULL DEFAULT '{}'::jsonb,
  status_hint TEXT,
  failed BOOLEAN NOT NULL DEFAULT FALSE,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, provider, external_key)
);
CREATE INDEX idx_work_event_sources_event ON bureau.work_event_sources(work_event_id);
CREATE INDEX idx_work_event_sources_log ON bureau.work_event_sources(activity_log_id) WHERE activity_log_id IS NOT NULL;

ALTER TABLE bureau.work_event_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_event_sources_select ON bureau.work_event_sources
  FOR SELECT USING (user_id = auth.uid() OR bureau.is_workspace_leader(workspace_id));
CREATE POLICY work_event_sources_insert ON bureau.work_event_sources
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM bureau.work_events e WHERE e.id = work_event_id AND e.user_id = auth.uid())
  );
CREATE POLICY work_event_sources_delete ON bureau.work_event_sources
  FOR DELETE USING (user_id = auth.uid());

-- Recompute a unit's counters from its signals; delete the unit when nothing is left.
-- SECURITY INVOKER: runs under the caller's RLS.
CREATE OR REPLACE FUNCTION bureau.recompute_work_event(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = bureau, pg_temp
AS $$
DECLARE
  v_n INT;
BEGIN
  SELECT count(*) INTO v_n FROM bureau.work_event_sources WHERE work_event_id = p_id;
  IF v_n = 0 THEN
    DELETE FROM bureau.work_events WHERE id = p_id;
    RETURN;
  END IF;
  UPDATE bureau.work_events e SET
    signal_count = v_n,
    effort = COALESCE((
      SELECT jsonb_object_agg(k, total) FROM (
        SELECT d.key AS k, sum(d.value::numeric) AS total
        FROM bureau.work_event_sources s, jsonb_each_text(s.effort_delta) d
        WHERE s.work_event_id = p_id AND d.value ~ '^-?[0-9]+(\.[0-9]+)?$'
        GROUP BY d.key
      ) t
    ), '{}'::jsonb),
    source_kinds = (SELECT array_agg(DISTINCT source_kind ORDER BY source_kind) FROM bureau.work_event_sources WHERE work_event_id = p_id)
  WHERE e.id = p_id AND e.hidden_at IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION bureau.recompute_work_event(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bureau.recompute_work_event(UUID) TO bureau_app;

-- When an AI request is hidden or deleted (Phase 1 controls), its signal leaves the unit.
CREATE OR REPLACE FUNCTION bureau.work_event_sources_after_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = bureau, pg_temp
AS $$
BEGIN
  PERFORM bureau.recompute_work_event(OLD.work_event_id);
  RETURN NULL;
END;
$$;
CREATE TRIGGER work_event_sources_after_delete
  AFTER DELETE ON bureau.work_event_sources
  FOR EACH ROW EXECUTE FUNCTION bureau.work_event_sources_after_delete();

CREATE OR REPLACE FUNCTION bureau.activity_logs_detach_on_hide()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = bureau, pg_temp
AS $$
BEGIN
  IF NEW.hidden_at IS NOT NULL AND OLD.hidden_at IS NULL THEN
    DELETE FROM bureau.work_event_sources WHERE activity_log_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER activity_logs_detach_on_hide
  AFTER UPDATE OF hidden_at ON bureau.activity_logs
  FOR EACH ROW EXECUTE FUNCTION bureau.activity_logs_detach_on_hide();

-- ---------------------------------------------------------------------------
-- 5. SECURITY DEFINER helpers for the anonymous webhook route and the sync cron.
-- They return ciphertext only (decrypted in the app), and the actor resolver only returns an
-- active member who has acknowledged the current notice.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bureau.gt_integration_for_webhook(p_id UUID, p_provider TEXT)
RETURNS TABLE (workspace_id UUID, secret_enc TEXT, config JSONB)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
  SELECT i.workspace_id, i.secret_enc, i.config
  FROM bureau.integrations i
  WHERE i.id = p_id AND i.provider = p_provider AND i.status = 'active' AND i.secret_enc IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION bureau.gt_resolve_actor(p_workspace_id UUID, p_provider TEXT, p_external_ids TEXT[], p_emails TEXT[], p_policy_version TEXT)
RETURNS TABLE (user_id UUID, email TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
  WITH candidates AS (
    SELECT l.user_id, 1 AS pri FROM bureau.identity_links l
    WHERE l.workspace_id = p_workspace_id AND l.provider = p_provider
      AND l.external_id = ANY (SELECT lower(x) FROM unnest(COALESCE(p_external_ids, '{}'::text[])) x)
    UNION ALL
    SELECT wm.user_id, 2 AS pri FROM bureau.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id AND wm.user_id IS NOT NULL
      AND lower(wm.email) = ANY (SELECT lower(x) FROM unnest(COALESCE(p_emails, '{}'::text[])) x)
  )
  SELECT c.user_id, wm.email
  FROM candidates c
  JOIN bureau.workspace_members wm ON wm.workspace_id = p_workspace_id AND wm.user_id = c.user_id AND wm.removed_at IS NULL
  JOIN bureau.activity_consents ac ON ac.workspace_id = p_workspace_id AND ac.user_id = c.user_id
       AND ac.policy_version = p_policy_version AND ac.revoked_at IS NULL
  ORDER BY c.pri
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION bureau.gt_resolve_owner(p_workspace_id UUID, p_user_id UUID, p_policy_version TEXT)
RETURNS TABLE (user_id UUID, email TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
  SELECT wm.user_id, wm.email
  FROM bureau.workspace_members wm
  JOIN bureau.activity_consents ac ON ac.workspace_id = wm.workspace_id AND ac.user_id = wm.user_id
       AND ac.policy_version = p_policy_version AND ac.revoked_at IS NULL
  WHERE wm.workspace_id = p_workspace_id AND wm.user_id = p_user_id AND wm.removed_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION bureau.gt_mark_integration(p_id UUID, p_ok BOOLEAN, p_error TEXT, p_cursor TEXT, p_synced BOOLEAN)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
  UPDATE bureau.integrations SET
    last_event_at = CASE WHEN p_ok AND NOT p_synced THEN NOW() ELSE last_event_at END,
    last_sync_at = CASE WHEN p_synced THEN NOW() ELSE last_sync_at END,
    sync_cursor = COALESCE(left(p_cursor, 500), sync_cursor),
    last_error = CASE WHEN p_ok THEN NULL ELSE left(p_error, 300) END,
    updated_at = NOW()
  WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION bureau.gt_sync_targets(p_only UUID)
RETURNS TABLE (id UUID, workspace_id UUID, provider TEXT, owner_user_id UUID, config JSONB, credential_enc TEXT, sync_cursor TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
  SELECT i.id, i.workspace_id, i.provider, i.owner_user_id, i.config, i.credential_enc, i.sync_cursor
  FROM bureau.integrations i
  WHERE i.status = 'active' AND i.credential_enc IS NOT NULL
    AND i.provider IN ('google_drive', 'elevenlabs', 'higgsfield')
    AND (p_only IS NULL OR i.id = p_only)
  ORDER BY i.last_sync_at NULLS FIRST
  LIMIT 50;
$$;

CREATE OR REPLACE FUNCTION bureau.purge_expired_work_events()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM bureau.work_events WHERE expires_at <= NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'bureau.gt_integration_for_webhook(uuid, text)',
    'bureau.gt_resolve_actor(uuid, text, text[], text[], text)',
    'bureau.gt_resolve_owner(uuid, uuid, text)',
    'bureau.gt_mark_integration(uuid, boolean, text, text, boolean)',
    'bureau.gt_sync_targets(uuid)',
    'bureau.purge_expired_work_events()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO bureau_app', f);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON bureau.integrations TO bureau_app;
GRANT SELECT, INSERT, DELETE ON bureau.identity_links TO bureau_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON bureau.work_events TO bureau_app;
GRANT SELECT, INSERT, DELETE ON bureau.work_event_sources TO bureau_app;
REVOKE UPDATE ON bureau.identity_links, bureau.work_event_sources FROM bureau_app;
