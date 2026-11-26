/**
 * Passive activity log: consent, write, read, hide. All functions take a pg client that is
 * already inside withUser(...) so RLS (bureau.activity_logs / activity_consents) applies:
 * - employees read and hide only their own rows;
 * - workspace owners/admins read every row in their workspace (hidden rows show as stubs);
 * - writes need an active acknowledgement of the current notice.
 * Content is scrubbed for secrets, then AES-256-GCM encrypted before it reaches Postgres.
 */
import { decryptActivity, encryptActivity, ACTIVITY_KEY_VERSION } from './activity-crypto';
import { scrubSecrets } from './activity-scrub';
import { ACTIVITY_POLICY_VERSION, ACTIVITY_RETENTION_DAYS } from './activity-policy';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- pg PoolClient-compatible
export type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

export const MAX_REQUEST_CHARS = 4000;
export const MAX_DETAIL_CHARS = 4000;
const SCAN_CAP = 2000; // rows decrypted per search, newest first (30-day window)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ConsentSource = 'oauth_consent' | 'device_consent' | 'web';

export interface ConsentStatus {
  accepted: boolean;            // an active acknowledgement of the CURRENT notice
  policy_version: string;       // current notice version
  accepted_at: string | null;
  revoked_at: string | null;
}

export async function recordConsent(client: Queryable, workspaceId: string, userId: string, source: ConsentSource): Promise<void> {
  await client.query(
    `INSERT INTO bureau.activity_consents (workspace_id, user_id, policy_version, source)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (workspace_id, user_id, policy_version)
     DO UPDATE SET revoked_at = NULL, accepted_at = NOW(), source = EXCLUDED.source`,
    [workspaceId, userId, ACTIVITY_POLICY_VERSION, source]
  );
}

export async function revokeConsent(client: Queryable, workspaceId: string, userId: string): Promise<void> {
  await client.query(
    `UPDATE bureau.activity_consents SET revoked_at = NOW()
     WHERE workspace_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [workspaceId, userId]
  );
}

export async function consentStatus(client: Queryable, workspaceId: string, userId: string): Promise<ConsentStatus> {
  const rows = (await client.query(
    `SELECT accepted_at, revoked_at FROM bureau.activity_consents
     WHERE workspace_id = $1 AND user_id = $2 AND policy_version = $3`,
    [workspaceId, userId, ACTIVITY_POLICY_VERSION]
  )).rows;
  const r = rows[0];
  return {
    accepted: !!r && !r.revoked_at,
    policy_version: ACTIVITY_POLICY_VERSION,
    accepted_at: r?.accepted_at ? new Date(r.accepted_at).toISOString() : null,
    revoked_at: r?.revoked_at ? new Date(r.revoked_at).toISOString() : null,
  };
}

export interface LogInput {
  workspaceId: string;
  userId: string;
  cloneId?: string | null;
  agentLinkId?: string | null;
  agentLabel?: string | null;
  vendor?: string | null;
  kind?: 'request' | 'action';
  request: string;
  detail?: string | null;
  conversationRef?: string | null;
  occurredAt?: string | null;
  personal?: boolean;
  source?: 'mcp_tool' | 'extension' | 'gateway' | 'compliance_api' | 'slack';
}

export type LogResult =
  | { status: 'logged'; id: string; personal: boolean; secrets_removed: number; expires_at: string }
  | { status: 'consent_required' }
  | { status: 'invalid'; message: string };

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\u2026 [truncated]` : s);

/** Accept a client timestamp only if it is within the last 24h and not in the future. */
function normalizeOccurredAt(input: string | null | undefined): Date {
  const now = Date.now();
  if (!input) return new Date(now);
  const t = Date.parse(input);
  if (Number.isNaN(t) || t > now + 5 * 60_000 || t < now - 24 * 3600_000) return new Date(now);
  return new Date(t);
}

export async function logActivity(client: Queryable, input: LogInput): Promise<LogResult> {
  const status = await consentStatus(client, input.workspaceId, input.userId);
  if (!status.accepted) return { status: 'consent_required' };

  const personal = input.personal === true;
  const rawRequest = typeof input.request === 'string' ? input.request.trim() : '';
  if (!personal && !rawRequest) return { status: 'invalid', message: 'request is required' };
  const kind = input.kind === 'action' ? 'action' : 'request';

  let requestEnc: string | null = null;
  let detailEnc: string | null = null;
  let removed = 0;
  if (!personal) {
    const req = scrubSecrets(clip(rawRequest, MAX_REQUEST_CHARS));
    removed += req.count;
    requestEnc = encryptActivity(req.text, input.workspaceId, input.userId);
    const rawDetail = typeof input.detail === 'string' ? input.detail.trim() : '';
    if (rawDetail) {
      const det = scrubSecrets(clip(rawDetail, MAX_DETAIL_CHARS));
      removed += det.count;
      detailEnc = encryptActivity(det.text, input.workspaceId, input.userId);
    }
  }

  const occurredAt = normalizeOccurredAt(input.occurredAt);
  const rows = (await client.query(
    `INSERT INTO bureau.activity_logs (
       workspace_id, user_id, clone_id, agent_link_id, source, vendor, agent_label, kind,
       request_enc, detail_enc, key_version, secrets_scrubbed, conversation_ref, occurred_at,
       hidden_at, expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
       CASE WHEN $15::boolean THEN NOW() ELSE NULL END,
       NOW() + make_interval(days => $16::int))
     RETURNING id, expires_at`,
    [
      input.workspaceId, input.userId, input.cloneId ?? null, input.agentLinkId ?? null,
      input.source ?? 'mcp_tool',
      input.vendor ? String(input.vendor).slice(0, 40) : null,
      input.agentLabel ? String(input.agentLabel).slice(0, 100) : null,
      kind, requestEnc, detailEnc, ACTIVITY_KEY_VERSION, removed,
      input.conversationRef ? String(input.conversationRef).slice(0, 200) : null,
      occurredAt.toISOString(), personal, ACTIVITY_RETENTION_DAYS,
    ]
  )).rows;
  return {
    status: 'logged',
    id: rows[0].id,
    personal,
    secrets_removed: removed,
    expires_at: new Date(rows[0].expires_at).toISOString(),
  };
}

export interface ActivityEntry {
  id: string;
  occurred_at: string;
  user_id: string;
  email: string | null;
  agent_label: string | null;
  vendor: string | null;
  source: string;
  kind: string;
  hidden: boolean;
  request: string | null;   // null when hidden
  detail: string | null;
  secrets_removed: number;
}

export interface ListOptions {
  workspaceId: string;
  userIds?: string[] | null;     // restrict to these people
  query?: string | null;         // case-insensitive; every word must appear
  since?: string | null;
  until?: string | null;
  limit?: number;
  includeHidden?: boolean;       // default true (stubs only, never content)
}

function safeDecrypt(env: string | null, ws: string, user: string): string | null {
  if (!env) return null;
  try {
    return decryptActivity(env, ws, user);
  } catch {
    return '[unreadable: encryption key changed]';
  }
}

/**
 * Newest first. RLS decides whose rows come back (own rows, or the whole workspace for
 * owners/admins). Text search runs in memory after decryption, over at most SCAN_CAP rows.
 */
export async function listActivity(client: Queryable, opts: ListOptions): Promise<{ entries: ActivityEntry[]; scanned: number; truncated: boolean }> {
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
  const userIds = (opts.userIds || []).filter(u => UUID_RE.test(u));
  // Asked for specific people but none valid: return nothing rather than everyone.
  if (opts.userIds && opts.userIds.length > 0 && userIds.length === 0) return { entries: [], scanned: 0, truncated: false };
  const since = opts.since && !Number.isNaN(Date.parse(opts.since)) ? new Date(opts.since).toISOString() : null;
  const until = opts.until && !Number.isNaN(Date.parse(opts.until)) ? new Date(opts.until).toISOString() : null;
  const words = String(opts.query || '').toLowerCase().split(/\s+/).map(w => w.trim()).filter(Boolean).slice(0, 10);
  const includeHidden = opts.includeHidden !== false && words.length === 0;

  const rows = (await client.query(
    `SELECT a.id, a.occurred_at, a.user_id, a.agent_label, a.vendor, a.source, a.kind,
            a.hidden_at, a.request_enc, a.detail_enc, a.secrets_scrubbed,
            (SELECT wm.email FROM bureau.workspace_members wm
              WHERE wm.workspace_id = a.workspace_id AND wm.user_id = a.user_id LIMIT 1) AS email
     FROM bureau.activity_logs a
     WHERE a.workspace_id = $1
       AND a.expires_at > NOW()
       AND ($2::uuid[] IS NULL OR a.user_id = ANY($2::uuid[]))
       AND ($3::timestamptz IS NULL OR a.occurred_at >= $3::timestamptz)
       AND ($4::timestamptz IS NULL OR a.occurred_at <= $4::timestamptz)
       AND ($5::boolean OR a.hidden_at IS NULL)
     ORDER BY a.occurred_at DESC
     LIMIT $6`,
    [opts.workspaceId, userIds.length ? userIds : null, since, until, includeHidden, words.length ? SCAN_CAP : limit]
  )).rows;

  const entries: ActivityEntry[] = [];
  for (const r of rows) {
    const hidden = !!r.hidden_at;
    const request = hidden ? null : safeDecrypt(r.request_enc, opts.workspaceId, r.user_id);
    const detail = hidden ? null : safeDecrypt(r.detail_enc, opts.workspaceId, r.user_id);
    if (words.length) {
      const hay = `${request || ''}\n${detail || ''}\n${r.agent_label || ''}`.toLowerCase();
      if (!words.every(w => hay.includes(w))) continue;
    }
    entries.push({
      id: r.id,
      occurred_at: new Date(r.occurred_at).toISOString(),
      user_id: r.user_id,
      email: r.email ?? null,
      agent_label: r.agent_label,
      vendor: r.vendor,
      source: r.source,
      kind: r.kind,
      hidden,
      request,
      detail,
      secrets_removed: r.secrets_scrubbed,
    });
    if (entries.length >= limit) break;
  }
  return { entries, scanned: rows.length, truncated: words.length > 0 && rows.length >= SCAN_CAP };
}

export interface PersonSummary {
  user_id: string;
  email: string | null;
  role: string | null;
  requests_7d: number;
  hidden_7d: number;
  last_activity_at: string | null;
  consent_accepted: boolean;
}

/** One row per active workspace member (owners/admins see everyone; RLS limits others to self). */
export async function activityPeople(client: Queryable, workspaceId: string): Promise<PersonSummary[]> {
  const rows = (await client.query(
    `SELECT wm.user_id, wm.email, wm.role::text AS role,
            COUNT(a.id) FILTER (WHERE a.hidden_at IS NULL AND a.occurred_at > NOW() - INTERVAL '7 days')::int AS requests_7d,
            COUNT(a.id) FILTER (WHERE a.hidden_at IS NOT NULL AND a.occurred_at > NOW() - INTERVAL '7 days')::int AS hidden_7d,
            MAX(a.occurred_at) AS last_activity_at,
            EXISTS (SELECT 1 FROM bureau.activity_consents c
                     WHERE c.workspace_id = wm.workspace_id AND c.user_id = wm.user_id
                       AND c.policy_version = $2 AND c.revoked_at IS NULL) AS consent_accepted
     FROM bureau.workspace_members wm
     LEFT JOIN bureau.activity_logs a
       ON a.workspace_id = wm.workspace_id AND a.user_id = wm.user_id AND a.expires_at > NOW()
     WHERE wm.workspace_id = $1 AND wm.removed_at IS NULL
     GROUP BY wm.workspace_id, wm.user_id, wm.email, wm.role
     ORDER BY MAX(a.occurred_at) DESC NULLS LAST, wm.email`,
    [workspaceId, ACTIVITY_POLICY_VERSION]
  )).rows;
  return rows.map(r => ({
    user_id: r.user_id,
    email: r.email,
    role: r.role,
    requests_7d: r.requests_7d,
    hidden_7d: r.hidden_7d,
    last_activity_at: r.last_activity_at ? new Date(r.last_activity_at).toISOString() : null,
    consent_accepted: r.consent_accepted,
  }));
}

/** Mark one of YOUR entries personal: content is erased for good, a dated stub remains. */
export async function hideActivity(client: Queryable, id: string, userId: string): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  const res = await client.query(
    `UPDATE bureau.activity_logs SET hidden_at = NOW(), request_enc = NULL, detail_enc = NULL
     WHERE id = $1 AND user_id = $2 AND hidden_at IS NULL RETURNING id`,
    [id, userId]
  );
  return res.rows.length > 0;
}

/** Delete one of YOUR entries entirely (e.g. you pasted something sensitive). */
export async function deleteActivity(client: Queryable, id: string, userId: string): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  const res = await client.query(
    `DELETE FROM bureau.activity_logs WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return res.rows.length > 0;
}

/** Is the caller an active owner/admin of the workspace (server-side check, not RLS). */
export async function isLeader(client: Queryable, workspaceId: string): Promise<boolean> {
  const rows = (await client.query(`SELECT bureau.is_workspace_leader($1) AS ok`, [workspaceId])).rows;
  return rows[0]?.ok === true;
}

export async function workspaceOwnerEmail(client: Queryable, workspaceId: string): Promise<string | null> {
  const rows = (await client.query(
    `SELECT email FROM bureau.workspace_members
     WHERE workspace_id = $1 AND role::text = 'owner' AND removed_at IS NULL
     ORDER BY joined_at NULLS LAST LIMIT 1`,
    [workspaceId]
  )).rows;
  return rows[0]?.email ?? null;
}
