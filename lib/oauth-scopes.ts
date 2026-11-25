/** Scopes shared by the authorize, device and DCR endpoints. */
export const ALLOWED_SCOPES: string[] = ['ingest:write', 'clone:write', 'questions:read', 'questions:write', 'team:read'];

/** What an employee's bot gets when the client asks for nothing (team:read is opt-in). */
export const DEFAULT_SCOPES: string[] = ['ingest:write', 'clone:write', 'questions:read', 'questions:write'];

/** Read the whole team's check-ins and ask any teammate's clone a question. Owners/admins only. */
export const LEADER_SCOPE = 'team:read';

/** The full set an owner/admin's own AI gets by default. */
export const LEADER_SCOPES: string[] = [...DEFAULT_SCOPES, LEADER_SCOPE];

export type WorkspaceRole = 'owner' | 'admin' | 'member';

export const SCOPE_DESCRIPTIONS: Record<string, string> = {
  'ingest:write': 'Post costs and activity to your streams',
  'clone:write': 'Post daily check-ins and update your profile',
  'questions:read': 'Read questions asked of you',
  'questions:write': 'Answer and escalate questions',
  'team:read': "See your team's check-ins and ask any teammate's AI a question",
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

/**
 * Apply the approving user's workspace role to a normalized scope list, at grant time.
 * - member / no role: team:read is always removed, even if the client asked for it.
 * - owner / admin: team:read is added when the request covers the full employee set
 *   (i.e. a normal "connect my AI" request, or a client that asks for everything).
 *   Narrow script requests (e.g. just ingest:write) are left as asked.
 * Unknown scopes pass through untouched so the caller's invalid_scope check still fires.
 */
export function scopesForRole(scopes: string[], role: string | null | undefined): string[] {
  const base = scopes.filter(s => s !== LEADER_SCOPE);
  if (!isLeaderRole(role)) return base;
  const coversDefault = DEFAULT_SCOPES.every(s => scopes.includes(s));
  return coversDefault || scopes.includes(LEADER_SCOPE) ? [...base, LEADER_SCOPE] : base;
}
