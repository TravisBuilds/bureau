/** Scopes shared by the authorize, device and DCR endpoints. */
export const ALLOWED_SCOPES: string[] = ['ingest:write', 'clone:write', 'questions:read', 'questions:write', 'team:read', 'activity:read'];

/** What an employee's bot gets when the client asks for nothing (team:read is opt-in). */
export const DEFAULT_SCOPES: string[] = ['ingest:write', 'clone:write', 'questions:read', 'questions:write'];

/**
 * Full team transparency: when true, every active workspace member (including regular
 * 'member' users, not just owners/admins) receives team:read on default connects and
 * passes the per-call MCP team-read check. Cross-workspace isolation and removed-member
 * rejection still apply.
 */
export const FULL_TEAM_TRANSPARENCY = true;

/** Read the whole team's check-ins and ask any teammate's clone a question. */
export const LEADER_SCOPE = 'team:read';

/**
 * Read employees' logged AI requests (bureau_search_activity / bureau_activity_timeline).
 * Owners/admins ONLY, regardless of FULL_TEAM_TRANSPARENCY: check-ins are team-wide, raw
 * requests are not.
 */
export const ACTIVITY_READ_SCOPE = 'activity:read';

/** The full set an owner/admin's own AI gets by default. */
export const LEADER_SCOPES: string[] = [...DEFAULT_SCOPES, LEADER_SCOPE, ACTIVITY_READ_SCOPE];

export type WorkspaceRole = 'owner' | 'admin' | 'member';

export const SCOPE_DESCRIPTIONS: Record<string, string> = {
  'ingest:write': 'Post costs and activity to your streams',
  'clone:write': 'Post daily check-ins and update your profile',
  'questions:read': 'Read questions asked of you',
  'questions:write': 'Answer and escalate questions',
  'team:read': "See your team's check-ins and ask any teammate's AI a question",
  'activity:read': "Search your team's logged AI requests (owners and admins only)",
};

/**
 * Normalize what a client asked for. Accepts a space-separated string or an array;
 * empty/missing -> DEFAULT_SCOPES. Does not drop unknown scopes (callers reject them
 * with invalid_scope) and does not look at the user's role (see scopesForRole).
 */
export function resolveScopes(input: string | string[] | null | undefined): string[] {
  const list = Array.isArray(input) ? input : (input || '').split(' ');
  const cleaned = [...new Set(list.map(s => String(s).trim()).filter(Boolean))];
  return cleaned.length ? cleaned : [...DEFAULT_SCOPES];
}

export const isLeaderRole = (role: string | null | undefined): boolean => role === 'owner' || role === 'admin';

export const canReadTeam = (role: string | null | undefined): boolean =>
  FULL_TEAM_TRANSPARENCY
    ? role === 'owner' || role === 'admin' || role === 'member'
    : isLeaderRole(role);

/**
 * Apply the approving user's workspace role to a normalized scope list, at grant time.
 * - no active role: team:read is always removed, even if the client asked for it.
 * - active role allowed by canReadTeam (all active members under FULL_TEAM_TRANSPARENCY,
 *   or owner/admin otherwise): team:read is added when the request covers the full employee
 *   set (or explicitly requests team:read). Narrow script requests (e.g. just ingest:write)
 *   are left as asked.
 * - activity:read is added only for owner/admin (same trigger), and always removed otherwise.
 * Unknown scopes pass through untouched so the caller's invalid_scope check still fires.
 */
export function scopesForRole(scopes: string[], role: string | null | undefined): string[] {
  const base = scopes.filter(s => s !== LEADER_SCOPE && s !== ACTIVITY_READ_SCOPE);
  if (!canReadTeam(role)) return base;
  const coversDefault = DEFAULT_SCOPES.every(s => scopes.includes(s));
  const out = coversDefault || scopes.includes(LEADER_SCOPE) ? [...base, LEADER_SCOPE] : base;
  // activity:read: owners/admins only (never members, even under full transparency).
  if (isLeaderRole(role) && (coversDefault || scopes.includes(ACTIVITY_READ_SCOPE))) out.push(ACTIVITY_READ_SCOPE);
  return out;
}

export const canReadActivity = (role: string | null | undefined): boolean => isLeaderRole(role);
