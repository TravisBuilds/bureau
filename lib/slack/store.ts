/**
 * Database + Slack lookups for the signature-verified webhook path. Runs as bureau_app without a
 * user session, so it only uses the narrow SECURITY DEFINER functions from
 * 20261127000000_slack_connect.sql. Tokens are decrypted here, in memory, and never returned to
 * a client or logged.
 */
import { query } from '../db';
import { decryptBotToken } from './token-crypto';
import { slackApi } from './api';

export interface Installation {
  teamId: string;
  workspaceId: string;
  status: 'active' | 'revoked' | 'uninstalled';
  botUserId: string | null;
  teamName: string | null;
  encryptedToken: string | null;
}

export interface Requester { workspaceId: string; userId: string; email: string; role: 'owner' | 'admin' | 'member' }

export async function getInstallation(teamId: string): Promise<Installation | null> {
  const rows = await query<{ workspace_id: string; status: Installation['status']; bot_user_id: string | null; team_name: string | null; encrypted_bot_token: string | null }>(
    'SELECT * FROM bureau.slack_get_installation($1)', [teamId]
  );
  const r = rows[0];
  if (!r) return null;
  return { teamId, workspaceId: r.workspace_id, status: r.status, botUserId: r.bot_user_id, teamName: r.team_name, encryptedToken: r.encrypted_bot_token };
}

/** The decrypted bot token for an active installation, or null (inactive, missing or undecryptable). */
export function botToken(inst: Installation | null): string | null {
  if (!inst || inst.status !== 'active' || !inst.encryptedToken) return null;
  try {
    return decryptBotToken(inst.encryptedToken, inst.workspaceId, inst.teamId);
  } catch {
    console.error('[slack] bot token could not be decrypted (key missing or changed); reinstall needed');
    return null;
  }
}

export async function markUninstalled(teamId: string, status: 'revoked' | 'uninstalled'): Promise<void> {
  await query('SELECT bureau.slack_mark_uninstalled($1, $2)', [teamId, status]);
}

async function resolveLinked(teamId: string, slackUserId: string): Promise<Requester | null> {
  const rows = await query<{ workspace_id: string; user_id: string; email: string; role: Requester['role'] }>(
    'SELECT * FROM bureau.slack_resolve_user($1, $2)', [teamId, slackUserId]
  );
  const r = rows[0];
  return r ? { workspaceId: r.workspace_id, userId: r.user_id, email: r.email, role: r.role } : null;
}

export interface SlackUserInfo { id: string; teamId: string | null; email: string | null; name: string | null; deleted: boolean; isBot: boolean }

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Slack user JSON
function toUserInfo(u: any): SlackUserInfo {
  return {
    id: String(u?.id || ''),
    teamId: typeof u?.team_id === 'string' ? u.team_id : null,
    email: typeof u?.profile?.email === 'string' ? u.profile.email.trim().toLowerCase() : null,
    name: (u?.profile?.display_name || u?.profile?.real_name || u?.real_name || u?.name || null) as string | null,
    deleted: u?.deleted === true,
    isBot: u?.is_bot === true || u?.id === 'USLACKBOT',
  };
}

/** A Slack user we may link: a real, current person who belongs to the installed Slack team. */
export function linkableUser(u: SlackUserInfo, teamId: string): boolean {
  return !!u.id && !u.deleted && !u.isBot && u.teamId === teamId;
}

async function linkByEmail(teamId: string, u: SlackUserInfo): Promise<string | null> {
  const rows = await query<{ m: string | null }>(
    'SELECT bureau.slack_link_user_by_email($1, $2, $3, $4) AS m',
    [teamId, u.id, u.email, u.name ? u.name.slice(0, 200) : null]
  );
  return rows[0]?.m ?? null;
}

/**
 * Who is this Slack user in Bureau? Uses an existing link, else looks them up once with
 * users.info and links them when their Slack email matches exactly one active member.
 */
export async function resolveRequester(teamId: string, slackUserId: string, token: string): Promise<Requester | null> {
  const linked = await resolveLinked(teamId, slackUserId);
  if (linked) return linked;
  const info = await slackApi('users.info', { token, form: { user: slackUserId } });
  if (!info.ok || !info.user) return null;
  const u = toUserInfo(info.user);
  if (u.id !== slackUserId || !linkableUser(u, teamId)) return null;
  await linkByEmail(teamId, u);
  return resolveLinked(teamId, slackUserId);
}

/** Bureau member behind a Slack user id, without calling Slack (for "<@U123>" in a command). */
export async function memberForSlackUser(teamId: string, slackUserId: string): Promise<Requester | null> {
  return resolveLinked(teamId, slackUserId);
}

/** Owner/admin "Refresh Slack members": users.list (paged, capped) and link by email. */
export async function syncSlackMembers(teamId: string, token: string): Promise<{ seen: number; linked: number; unlinked: number; error?: string }> {
  let cursor = '';
  let seen = 0, linked = 0, unlinked = 0;
  for (let page = 0; page < 20; page++) {
    const form: Record<string, string> = { limit: '200' };
    if (cursor) form.cursor = cursor;
    const res = await slackApi('users.list', { token, form });
    if (!res.ok) return { seen, linked, unlinked, error: String(res.error || 'users.list failed') };
    const members = Array.isArray(res.members) ? res.members : [];
    for (const raw of members) {
      const u = toUserInfo(raw);
      if (!linkableUser(u, teamId)) continue;
      seen++;
      if (await linkByEmail(teamId, u)) linked++; else unlinked++;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Slack JSON
    cursor = String((res as any).response_metadata?.next_cursor || '');
    if (!cursor) break;
  }
  return { seen, linked, unlinked };
}
