/**
 * Resolve "who" (a name, handle, email or Slack handle) to a Digital Clone in ONE workspace.
 *
 * - Always scoped to the given workspace (and, because it runs under withUser, to the caller's
 *   RLS view as well), so a name can never resolve to a clone in another workspace.
 * - Only clones whose owner is still an active member are considered.
 * - Matching happens in app code on the workspace's (small) clone list, so there is no SQL
 *   LIKE and no wildcard injection ("%" matches only a literal "%").
 * - Tiers, first non-empty tier wins: exact -> person (first name / email local part /
 *   handle prefix) -> substring. Several clones of the same person resolve to the one that
 *   checked in most recently (then most recently seen); clones of different people are
 *   returned as candidates.
 */

export interface CloneLookupResult {
  id: string;
  display_name: string;
  handle: string;
  owner_user_id: string;
  owner_email: string | null;
  slack_handle: string | null;
  last_seen_at: string | null;
  last_checkin_date?: string | null; // YYYY-MM-DD of the newest heartbeat, if any
}

export type LookupResponse =
  | { status: 'found'; clone: CloneLookupResult; other_clones_of_same_person: CloneLookupResult[] }
  | { status: 'ambiguous'; candidates: CloneLookupResult[] }
  | { status: 'not_found'; query: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- pg PoolClient-compatible
type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

const MAX_CANDIDATES = 10;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeWho(who: string): string {
  return String(who || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/'s\b/g, '')
    .replace(/\s+/g, ' ');
}

const slug = (s: string) => s.toLowerCase().replace(/['\u2019]s\b/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const emailLocal = (e: string | null) => (e || '').toLowerCase().split('@')[0];
const firstWord = (s: string) => s.toLowerCase().replace(/[\u2018\u2019]/g, "'").split(/['\s._-]+/).filter(Boolean)[0] || '';

/** Pure matcher (exported for tests). */
export function matchClones(rows: CloneLookupResult[], who: string): CloneLookupResult[] {
  const q = normalizeWho(who);
  if (!q) return [];
  const qSlug = slug(q);

  const exact = rows.filter(r =>
    r.id.toLowerCase() === q ||
    r.handle.toLowerCase() === q ||
    normalizeWho(r.display_name) === q ||
    (r.slack_handle && normalizeWho(r.slack_handle) === q) ||
    (r.owner_email && r.owner_email.toLowerCase() === q)
  );
  if (exact.length) return exact;

  const person = rows.filter(r => {
    const local = emailLocal(r.owner_email);
    return local === q || firstWord(local) === q ||
      r.handle.toLowerCase().startsWith(`${qSlug}-`) ||
      (qSlug && r.handle.toLowerCase() === qSlug) ||
      firstWord(r.display_name) === q;
  });
  if (person.length) return person;

  if (q.length >= 3) {
    const sub = rows.filter(r =>
      r.handle.toLowerCase().includes(q) ||
      r.display_name.toLowerCase().includes(q) ||
      emailLocal(r.owner_email).includes(q)
    );
    if (sub.length) return sub;
  }

  // "Jack Qiao" -> try "jack" if nothing matched the full name
  if (q.includes(' ')) return matchClones(rows, q.split(' ')[0]);
  return [];
}

const seen = (r: CloneLookupResult) => (r.last_seen_at ? new Date(r.last_seen_at).getTime() : -Infinity);
const checkin = (r: CloneLookupResult) => r.last_checkin_date || '';
/** The bot that actually posts check-ins wins; ties go to the most recently seen. */
const byFreshness = (a: CloneLookupResult, b: CloneLookupResult) =>
  checkin(b).localeCompare(checkin(a)) || seen(b) - seen(a);

export function resolveMatches(matches: CloneLookupResult[], who: string): LookupResponse {
  if (matches.length === 0) return { status: 'not_found', query: String(who || '') };
  const owners = new Set(matches.map(m => m.owner_user_id));
  if (owners.size === 1) {
    const sorted = [...matches].sort(byFreshness);
    return { status: 'found', clone: sorted[0], other_clones_of_same_person: sorted.slice(1) };
  }
  return { status: 'ambiguous', candidates: matches.slice(0, MAX_CANDIDATES) };
}

/** Load the workspace's clones (active owners only). Must run inside withUser(...). */
export async function listWorkspaceClones(client: Queryable, workspaceId: string): Promise<CloneLookupResult[]> {
  const { rows } = await client.query(
    `SELECT dc.id::text AS id, dc.display_name, dc.handle, dc.owner_user_id::text AS owner_user_id,
            wm.email AS owner_email, dc.slack_handle, dc.last_seen_at,
            (SELECT to_char(max(h.date), 'YYYY-MM-DD') FROM bureau.clone_heartbeats h WHERE h.clone_id = dc.id) AS last_checkin_date
       FROM bureau.digital_clones dc
       JOIN bureau.workspace_members wm
         ON wm.workspace_id = dc.workspace_id AND wm.user_id = dc.owner_user_id AND wm.removed_at IS NULL
      WHERE dc.workspace_id = $1
      ORDER BY dc.display_name`,
    [workspaceId]
  );
  return rows.map(r => ({ ...r, last_seen_at: r.last_seen_at ? new Date(r.last_seen_at).toISOString() : null }));
}

/** Resolve "who" to one clone in this workspace. Must run inside withUser(...). */
export async function lookupClone(client: Queryable, workspaceId: string, who: string): Promise<LookupResponse> {
  if (!who || !String(who).trim()) return { status: 'not_found', query: String(who || '') };
  const rows = await listWorkspaceClones(client, workspaceId);
  if (UUID_RE.test(String(who).trim())) {
    const byId = rows.filter(r => r.id === String(who).trim().toLowerCase());
    return resolveMatches(byId, who);
  }
  return resolveMatches(matchClones(rows, who), who);
}

/** Short, human-readable candidate list for an AI to show back to its user. */
export function formatCandidates(candidates: CloneLookupResult[]): string {
  return candidates
    .map(c => `${c.display_name} (@${c.handle}${c.owner_email ? `, ${c.owner_email}` : ''})`)
    .join('; ');
}
