/** Install / disconnect helpers used by the authenticated settings routes. */
import { withUser } from '../db';
import { getInstallation, botToken, markUninstalled } from './store';
import { slackApi } from './api';

export interface InstallationStatus {
  team_id: string;
  team_name: string | null;
  status: 'active' | 'revoked' | 'uninstalled';
  installed_at: string | null;
  uninstalled_at: string | null;
  scope: string | null;
}

/** The workspace's most relevant installation (active first), read under the caller's RLS. No token columns. */
export async function workspaceInstallation(userId: string, email: string, workspaceId: string): Promise<InstallationStatus | null> {
  const rows = await withUser(userId, email, async (client) => (await client.query(
    `SELECT team_id, team_name, status, installed_at, uninstalled_at, scope
       FROM bureau.slack_installations
      WHERE workspace_id = $1
      ORDER BY (status = 'active') DESC, updated_at DESC
      LIMIT 1`,
    [workspaceId]
  )).rows);
  const r = rows[0];
  if (!r) return null;
  return {
    team_id: r.team_id, team_name: r.team_name, status: r.status, scope: r.scope,
    installed_at: r.installed_at ? new Date(r.installed_at).toISOString() : null,
    uninstalled_at: r.uninstalled_at ? new Date(r.uninstalled_at).toISOString() : null,
  };
}

/** Disconnect: revoke the bot token at Slack (best effort), then destroy our ciphertext. */
export async function disconnectWorkspace(userId: string, email: string, workspaceId: string): Promise<boolean> {
  const st = await workspaceInstallation(userId, email, workspaceId);
  if (!st || st.status !== 'active') return false;
  const inst = await getInstallation(st.team_id);
  if (!inst || inst.workspaceId !== workspaceId) return false;
  const token = botToken(inst);
  if (token) {
    try { await slackApi('auth.revoke', { token, form: {} }); } catch { /* best effort */ }
  }
  await markUninstalled(st.team_id, 'uninstalled');
  return true;
}
