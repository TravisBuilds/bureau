-- Slack connect (Phase 1 install + Phase 2 reactive triggers)
-- Date: 2026-11-27
--
-- 1. Install metadata + status on bureau.slack_installations (no secrets in that table).
-- 2. bureau.slack_bot_tokens: per-Slack-team bot token, AES-256-GCM ciphertext made in app code.
--    RLS on, NO policies and NO grants to bureau_app: only the definer functions below touch it.
-- 3. bureau.slack_user_links: Slack user -> Bureau workspace member (email match or manual).
-- 4. Definer functions for the signature-verified webhook path (EXECUTE granted only to bureau_app).
-- 5. activity_logs.source accepts 'slack' (requests made of @Bureau in Slack, consent rules unchanged).
--
-- Never grants bureau_app USAGE on auth, role membership, or anything on oauth_tokens /
-- oauth_codes / oauth_device_codes.

SET search_path TO bureau, extensions;

-- ---------------------------------------------------------------------------
-- 1. Installation metadata
-- ---------------------------------------------------------------------------
ALTER TABLE bureau.slack_installations
  ADD COLUMN IF NOT EXISTS team_name TEXT CHECK (team_name IS NULL OR length(team_name) <= 200),
  ADD COLUMN IF NOT EXISTS bot_user_id TEXT CHECK (bot_user_id IS NULL OR bot_user_id ~ '^[UWB][A-Z0-9]{2,30}$'),
  ADD COLUMN IF NOT EXISTS app_id TEXT CHECK (app_id IS NULL OR length(app_id) <= 40),
  ADD COLUMN IF NOT EXISTS scope TEXT CHECK (scope IS NULL OR length(scope) <= 1000),
  ADD COLUMN IF NOT EXISTS authed_user_id TEXT CHECK (authed_user_id IS NULL OR length(authed_user_id) <= 40),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'uninstalled')),
  ADD COLUMN IF NOT EXISTS uninstalled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

COMMENT ON COLUMN bureau.slack_installations.status IS 'active | revoked (tokens_revoked) | uninstalled (app_uninstalled or Disconnect)';

-- ---------------------------------------------------------------------------
-- 2. Encrypted bot tokens (definer-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bureau.slack_bot_tokens (
  team_id TEXT PRIMARY KEY REFERENCES bureau.slack_installations(team_id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
  encrypted_bot_token TEXT NOT NULL CHECK (encrypted_bot_token ~ '^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE bureau.slack_bot_tokens IS 'Slack bot tokens, AES-256-GCM ciphertext only (encrypted in app code). No direct access for bureau_app: definer functions only.';

ALTER TABLE bureau.slack_bot_tokens ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies: with RLS on and no grants, nobody but the table owner can read it.
REVOKE ALL ON bureau.slack_bot_tokens FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE 'REVOKE ALL ON bureau.slack_bot_tokens FROM anon'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE 'REVOKE ALL ON bureau.slack_bot_tokens FROM authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bureau_app') THEN EXECUTE 'REVOKE ALL ON bureau.slack_bot_tokens FROM bureau_app'; END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Slack user -> Bureau member links
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bureau.slack_user_links (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES bureau.workspaces(id) ON DELETE CASCADE,
  slack_team_id TEXT NOT NULL CHECK (slack_team_id ~ '^[TE][A-Z0-9]{2,30}$'),
  slack_user_id TEXT NOT NULL CHECK (slack_user_id ~ '^[UW][A-Z0-9]{2,30}$'),
  slack_email TEXT CHECK (slack_email IS NULL OR length(slack_email) <= 320),
  slack_display_name TEXT CHECK (slack_display_name IS NULL OR length(slack_display_name) <= 200),
  member_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL = seen in Slack, not linked yet
  linked_how TEXT CHECK (linked_how IS NULL OR linked_how IN ('email', 'manual')),
  linked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, slack_user_id),
  CONSTRAINT slack_user_links_how CHECK ((member_user_id IS NULL) = (linked_how IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_slack_user_links_member ON bureau.slack_user_links(workspace_id, member_user_id);
CREATE INDEX IF NOT EXISTS idx_slack_user_links_team_user ON bureau.slack_user_links(slack_team_id, slack_user_id);
COMMENT ON TABLE bureau.slack_user_links IS 'Maps Slack users to Bureau workspace members (by verified Slack email, or manually by an owner/admin).';

ALTER TABLE bureau.slack_user_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY slack_user_links_select ON bureau.slack_user_links
  FOR SELECT USING (bureau.is_active_member(workspace_id));
CREATE POLICY slack_user_links_insert ON bureau.slack_user_links
  FOR INSERT WITH CHECK (bureau.is_workspace_leader(workspace_id));
CREATE POLICY slack_user_links_update ON bureau.slack_user_links
  FOR UPDATE USING (bureau.is_workspace_leader(workspace_id)) WITH CHECK (bureau.is_workspace_leader(workspace_id));
CREATE POLICY slack_user_links_delete ON bureau.slack_user_links
  FOR DELETE USING (bureau.is_workspace_leader(workspace_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON bureau.slack_user_links TO bureau_app;

-- ---------------------------------------------------------------------------
-- 4. Definer functions
-- ---------------------------------------------------------------------------

-- OAuth callback: store (or refresh) the install for the calling owner. Runs inside withUser, so
-- auth.uid() is the signed-in Bureau user; only an active OWNER of p_workspace_id may install.
-- Returns 'ok' | 'forbidden' | 'team_taken' | 'workspace_has_other_team'.
CREATE OR REPLACE FUNCTION bureau.slack_store_installation(
  p_workspace_id UUID, p_team_id TEXT, p_team_name TEXT, p_bot_user_id TEXT, p_app_id TEXT,
  p_scope TEXT, p_authed_user_id TEXT, p_ciphertext TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_existing UUID;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM bureau.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id AND wm.user_id = v_uid
      AND wm.removed_at IS NULL AND wm.role::text = 'owner'
  ) THEN
    RETURN 'forbidden';
  END IF;

  SELECT workspace_id INTO v_existing FROM bureau.slack_installations WHERE team_id = p_team_id;
  IF v_existing IS NOT NULL AND v_existing <> p_workspace_id THEN
    RETURN 'team_taken';
  END IF;

  IF EXISTS (
    SELECT 1 FROM bureau.slack_installations
    WHERE workspace_id = p_workspace_id AND team_id <> p_team_id AND status = 'active'
  ) THEN
    RETURN 'workspace_has_other_team';
  END IF;

  INSERT INTO bureau.slack_installations (
    workspace_id, team_id, installed_by, team_name, bot_user_id, app_id, scope, authed_user_id,
    status, uninstalled_at, installed_at, updated_at
  ) VALUES (
    p_workspace_id, p_team_id, v_uid, left(p_team_name, 200), p_bot_user_id, left(p_app_id, 40),
    left(p_scope, 1000), left(p_authed_user_id, 40), 'active', NULL, NOW(), NOW()
  )
  ON CONFLICT (team_id) DO UPDATE SET
    installed_by = EXCLUDED.installed_by, team_name = EXCLUDED.team_name,
    bot_user_id = EXCLUDED.bot_user_id, app_id = EXCLUDED.app_id, scope = EXCLUDED.scope,
    authed_user_id = EXCLUDED.authed_user_id, status = 'active', uninstalled_at = NULL,
    installed_at = NOW(), updated_at = NOW();

  INSERT INTO bureau.slack_bot_tokens (team_id, workspace_id, encrypted_bot_token)
  VALUES (p_team_id, p_workspace_id, p_ciphertext)
  ON CONFLICT (team_id) DO UPDATE SET
    workspace_id = EXCLUDED.workspace_id, encrypted_bot_token = EXCLUDED.encrypted_bot_token, updated_at = NOW();

  RETURN 'ok';
END;
$$;

-- Webhook path: installation + token ciphertext for one Slack team (decrypted in app code only).
CREATE OR REPLACE FUNCTION bureau.slack_get_installation(p_team_id TEXT)
RETURNS TABLE (workspace_id UUID, status TEXT, bot_user_id TEXT, team_name TEXT, encrypted_bot_token TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
  SELECT i.workspace_id, i.status, i.bot_user_id, i.team_name,
         CASE WHEN i.status = 'active' THEN t.encrypted_bot_token END
    FROM bureau.slack_installations i
    LEFT JOIN bureau.slack_bot_tokens t ON t.team_id = i.team_id
   WHERE i.team_id = p_team_id
   LIMIT 1;
$$;

-- app_uninstalled / tokens_revoked / Disconnect: mark the install and destroy the ciphertext.
CREATE OR REPLACE FUNCTION bureau.slack_mark_uninstalled(p_team_id TEXT, p_status TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
BEGIN
  IF p_status NOT IN ('revoked', 'uninstalled') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  DELETE FROM bureau.slack_bot_tokens WHERE team_id = p_team_id;
  UPDATE bureau.slack_installations
     SET status = p_status, uninstalled_at = NOW(), updated_at = NOW()
   WHERE team_id = p_team_id;
  RETURN FOUND;
END;
$$;

-- Webhook path: who is this Slack user in Bureau? Only links in the workspace the Slack team is
-- installed into, and only members who are still active.
CREATE OR REPLACE FUNCTION bureau.slack_resolve_user(p_team_id TEXT, p_slack_user_id TEXT)
RETURNS TABLE (workspace_id UUID, user_id UUID, email TEXT, role TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
  SELECT l.workspace_id, wm.user_id, wm.email, wm.role::text
    FROM bureau.slack_installations i
    JOIN bureau.slack_user_links l
      ON l.workspace_id = i.workspace_id AND l.slack_team_id = i.team_id AND l.slack_user_id = p_slack_user_id
    JOIN bureau.workspace_members wm
      ON wm.workspace_id = l.workspace_id AND wm.user_id = l.member_user_id AND wm.removed_at IS NULL
   WHERE i.team_id = p_team_id AND i.status = 'active'
   LIMIT 1;
$$;

-- Webhook / sync path: record a Slack user and link them by their Slack-verified email when it
-- matches exactly one active member. Never overwrites a manual link. Returns the linked member
-- user id (or NULL when not linked).
CREATE OR REPLACE FUNCTION bureau.slack_link_user_by_email(
  p_team_id TEXT, p_slack_user_id TEXT, p_email TEXT, p_display_name TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bureau, pg_temp
AS $$
DECLARE
  v_ws UUID;
  v_member UUID;
  v_n INT;
  v_existing RECORD;
BEGIN
  SELECT workspace_id INTO v_ws FROM bureau.slack_installations WHERE team_id = p_team_id AND status = 'active';
  IF v_ws IS NULL THEN RETURN NULL; END IF;

  IF p_email IS NOT NULL AND length(trim(p_email)) > 3 THEN
    SELECT count(*), min(wm.user_id::text)::uuid INTO v_n, v_member
      FROM bureau.workspace_members wm
     WHERE wm.workspace_id = v_ws AND wm.removed_at IS NULL AND lower(wm.email) = lower(trim(p_email));
    IF v_n <> 1 THEN v_member := NULL; END IF;
  END IF;

  SELECT * INTO v_existing FROM bureau.slack_user_links WHERE workspace_id = v_ws AND slack_user_id = p_slack_user_id;
  IF FOUND THEN
    IF v_existing.linked_how = 'manual' THEN
      UPDATE bureau.slack_user_links
         SET slack_email = COALESCE(lower(trim(p_email)), slack_email),
             slack_display_name = COALESCE(left(p_display_name, 200), slack_display_name), updated_at = NOW()
       WHERE id = v_existing.id;
      RETURN v_existing.member_user_id;
    END IF;
    UPDATE bureau.slack_user_links
       SET slack_email = lower(trim(p_email)), slack_display_name = left(p_display_name, 200),
           member_user_id = v_member, linked_how = CASE WHEN v_member IS NULL THEN NULL ELSE 'email' END,
           updated_at = NOW()
     WHERE id = v_existing.id;
  ELSE
    INSERT INTO bureau.slack_user_links (workspace_id, slack_team_id, slack_user_id, slack_email, slack_display_name, member_user_id, linked_how)
    VALUES (v_ws, p_team_id, p_slack_user_id, lower(trim(p_email)), left(p_display_name, 200), v_member,
            CASE WHEN v_member IS NULL THEN NULL ELSE 'email' END)
    ON CONFLICT (workspace_id, slack_user_id) DO NOTHING;
  END IF;
  RETURN v_member;
END;
$$;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'bureau.slack_store_installation(uuid, text, text, text, text, text, text, text)',
    'bureau.slack_get_installation(text)',
    'bureau.slack_mark_uninstalled(text, text)',
    'bureau.slack_resolve_user(text, text)',
    'bureau.slack_link_user_by_email(text, text, text, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f); END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO bureau_app', f);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Activity source 'slack'
-- ---------------------------------------------------------------------------
ALTER TABLE bureau.activity_logs DROP CONSTRAINT IF EXISTS activity_logs_source_check;
ALTER TABLE bureau.activity_logs ADD CONSTRAINT activity_logs_source_check
  CHECK (source IN ('mcp_tool', 'extension', 'gateway', 'compliance_api', 'slack'));
