/* eslint-disable @typescript-eslint/no-explicit-any -- vendor JSON and pg rows are untyped; every field is narrowed before use */
/**
 * Work units: the session stitcher (write side) and the board / timeline / digest queries
 * (read side). Every function takes a pg client already inside withUser(...), so RLS applies:
 *  - writes only for the signed-in (or resolved) person, only with an active notice acknowledgement;
 *  - reads: your own units, or the whole workspace for owners/admins.
 * Titles are scrubbed for secrets and AES-256-GCM encrypted before they reach Postgres.
 */
import { createHash } from 'crypto';
import { decryptScoped, encryptScoped, ACTIVITY_KEY_VERSION } from '../activity-crypto';
import { scrubSecrets } from '../activity-scrub';
import { consentStatus, type Queryable } from '../activity-log';
import { ACTIVITY_POLICY_VERSION, ACTIVITY_RETENTION_DAYS } from '../activity-policy';
import {
  classifyTaskType, detectStuck, disciplineFor, looksLikeFailure, resolveProject,
  CORRELATE_WINDOW_MIN, RETRY_THRESHOLD, RETRY_WINDOW_MIN, STITCH_WINDOW_MIN,
} from './classify';
import { isGroundTruth, type BlockerCode, type Confidence, type Signal, type TaskType, type WorkStatus } from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TITLE = 300;

export const externalKey = (provider: string, externalId: string) =>
  createHash('sha256').update(`${provider}:${externalId}`).digest('hex');

const cleanTitle = (s: string) => {
  const one = String(s || '').replace(/\s+/g, ' ').trim();
  const clipped = one.length > MAX_TITLE ? `${one.slice(0, MAX_TITLE)}\u2026` : one;
  return scrubSecrets(clipped).text || '(untitled)';
};
const safeLink = (s: string | null | undefined): string | null => {
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && s.length <= 500 ? u.toString() : null;
  } catch { return null; }
};

export interface RecordOptions {
  workspaceId: string;
  userId: string;
  projectMap?: Record<string, string>;
}

export type RecordResult =
  | { status: 'recorded'; work_event_id: string; created: boolean; matched_by: 'artifact' | 'session' | 'window' | 'new' }
  | { status: 'duplicate' }
  | { status: 'consent_required' }
  | { status: 'before_consent' };

/**
 * Merge one signal into the person's work units:
 *  1. dedupe on (provider, sha256(externalId));
 *  2. same artifact link -> same unit (PR opened ... PR merged);
 *  3. same project + task type within STITCH_WINDOW_MIN -> same unit (a burst of prompts);
 *  4. a tool artifact within CORRELATE_WINDOW_MIN of a prompt-only unit for the same project
 *     upgrades that unit (confidence 'correlated');
 *  5. otherwise a new unit.
 * Nothing is stored without an active acknowledgement of the CURRENT notice, and nothing that
 * happened before the person accepted it.
 */
export async function recordSignal(client: Queryable, opts: RecordOptions, sig: Signal): Promise<RecordResult> {
  const consent = await consentStatus(client, opts.workspaceId, opts.userId);
  if (!consent.accepted) return { status: 'consent_required' };
  if (consent.accepted_at && sig.occurredAt.getTime() < Date.parse(consent.accepted_at) - 60_000) return { status: 'before_consent' };

  const key = externalKey(sig.provider, sig.externalId);
  const dup = (await client.query(
    `SELECT 1 FROM bureau.work_event_sources WHERE workspace_id = $1 AND provider = $2 AND external_key = $3`,
    [opts.workspaceId, sig.provider, key]
  )).rows;
  if (dup.length) return { status: 'duplicate' };

  const text = `${sig.title}\n${sig.classifyText || ''}`;
  const project = resolveProject({ explicit: sig.project, hints: sig.projectHints, text, projectMap: opts.projectMap });
  const taskType: TaskType = sig.taskType || classifyTaskType(text, sig.tool);
  const discipline = disciplineFor(taskType, sig.tool);
  const truth = isGroundTruth(sig.sourceKind);
  const link = safeLink(sig.artifactLink);
  const stuck: BlockerCode | null = sig.blocker || (sig.sourceKind === 'agent_mcp' ? detectStuck(text) : null);
  const failed = sig.failed === true || (sig.sourceKind === 'agent_mcp' && looksLikeFailure(text));
  const at = sig.occurredAt.toISOString();

  let unit: any = null;
  let matchedBy: 'artifact' | 'session' | 'window' | 'new' = 'new';
  if (link) {
    unit = (await client.query(
      `SELECT * FROM bureau.work_events WHERE workspace_id = $1 AND user_id = $2 AND artifact_link = $3
         AND hidden_at IS NULL AND expires_at > NOW() ORDER BY last_seen_at DESC LIMIT 1`,
      [opts.workspaceId, opts.userId, link]
    )).rows[0];
    if (unit) matchedBy = 'artifact';
  }
  if (!unit) {
    unit = (await client.query(
      `SELECT * FROM bureau.work_events WHERE workspace_id = $1 AND user_id = $2 AND project = $3 AND task_type = $4
         AND hidden_at IS NULL AND expires_at > NOW()
         AND last_seen_at >= $5::timestamptz - make_interval(mins => $6)
         AND started_at <= $5::timestamptz + make_interval(mins => $6)
         AND ($7::text IS NULL OR artifact_link IS NULL OR artifact_link = $7)
       ORDER BY last_seen_at DESC LIMIT 1`,
      [opts.workspaceId, opts.userId, project, taskType, at, STITCH_WINDOW_MIN, link]
    )).rows[0];
    if (unit) matchedBy = 'session';
  }
  if (!unit && truth && project !== 'unassigned') {
    unit = (await client.query(
      `SELECT * FROM bureau.work_events WHERE workspace_id = $1 AND user_id = $2 AND project = $3
         AND confidence = 'self_reported' AND artifact_link IS NULL
         AND hidden_at IS NULL AND expires_at > NOW()
         AND last_seen_at >= $4::timestamptz - make_interval(mins => $5)
         AND started_at <= $4::timestamptz + make_interval(mins => $5)
       ORDER BY last_seen_at DESC LIMIT 1`,
      [opts.workspaceId, opts.userId, project, at, CORRELATE_WINDOW_MIN]
    )).rows[0];
    if (unit) matchedBy = 'window';
  }

  const titleEnc = (t: string) => encryptScoped('work', cleanTitle(t), [opts.workspaceId, opts.userId]);
  let workEventId: string;
  let created = false;
  if (!unit) {
    const status: WorkStatus = sig.status || (stuck ? 'blocked' : 'in_progress');
    const confidence: Confidence = truth ? 'verified_artifact' : 'self_reported';
    const rows = (await client.query(
      `INSERT INTO bureau.work_events (workspace_id, user_id, discipline, project, task_type, tool, tools, artifact_link,
         status, blocker_code, confidence, title_enc, key_version, started_at, last_seen_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, ARRAY[$6]::text[], $7, $8, $9, $10, $11, $12, $13, $13,
         NOW() + make_interval(days => $14::int))
       RETURNING id`,
      [opts.workspaceId, opts.userId, discipline, project, taskType, sig.tool.slice(0, 40), link, status,
       status === 'blocked' ? (stuck || sig.blocker || null) : null, confidence, titleEnc(sig.title), ACTIVITY_KEY_VERSION, at,
       ACTIVITY_RETENTION_DAYS]
    )).rows;
    workEventId = rows[0].id;
    created = true;
  } else {
    workEventId = unit.id;
    const hadTruth = (unit.source_kinds || []).some((k: string) => k === 'webhook_truth' || k === 'api_sync');
    // Status: ground truth decides; a prompt can only raise "blocked" (and never over shipped work).
    let status: WorkStatus = unit.status;
    let blocker: BlockerCode | null = unit.blocker_code;
    if (sig.status) {
      status = sig.status;
      blocker = status === 'blocked' ? (sig.blocker || blocker || null) : null;
    } else if (stuck && !['shipped', 'rendered'].includes(unit.status)) {
      status = 'blocked';
      blocker = stuck;
    }
    let confidence: Confidence = unit.confidence;
    if (truth && confidence === 'self_reported') confidence = matchedBy === 'window' ? 'correlated' : 'verified_artifact';
    const replaceTitle = truth && !hadTruth;
    await client.query(
      `UPDATE bureau.work_events SET
         started_at = LEAST(started_at, $2::timestamptz),
         last_seen_at = GREATEST(last_seen_at, $2::timestamptz),
         tools = CASE WHEN $3 = ANY(tools) THEN tools ELSE array_append(tools, $3) END,
         tool = CASE WHEN $4::boolean THEN $3 ELSE tool END,
         artifact_link = COALESCE($5, artifact_link),
         status = $6, blocker_code = $7, confidence = $8,
         title_enc = CASE WHEN $4::boolean THEN $9 ELSE title_enc END,
         discipline = COALESCE(discipline, $10)
       WHERE id = $1`,
      [workEventId, at, sig.tool.slice(0, 40), replaceTitle, link, status, blocker, confidence,
       replaceTitle ? titleEnc(sig.title) : null, discipline]
    );
  }

  const effort: Record<string, number> = { ...(sig.effort || {}) };
  if (sig.sourceKind === 'agent_mcp') effort.prompts = (effort.prompts || 0) + 1;
  await client.query(
    `INSERT INTO bureau.work_event_sources (work_event_id, workspace_id, user_id, provider, source_kind, external_key,
       activity_log_id, effort_delta, status_hint, failed, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)`,
    [workEventId, opts.workspaceId, opts.userId, sig.provider.slice(0, 40), sig.sourceKind, key,
     sig.activityLogId && UUID_RE.test(sig.activityLogId) ? sig.activityLogId : null,
     JSON.stringify(Object.fromEntries(Object.entries(effort).filter(([, v]) => Number.isFinite(v)))),
     sig.status || null, failed, at]
  );
  await client.query(`SELECT bureau.recompute_work_event($1)`, [workEventId]);

  // Retry-loop rule: RETRY_THRESHOLD failed attempts within RETRY_WINDOW_MIN -> blocked.
  if (failed) {
    const n = (await client.query(
      `SELECT count(*)::int AS n FROM bureau.work_event_sources
       WHERE work_event_id = $1 AND failed AND occurred_at >= $2::timestamptz - make_interval(mins => $3)`,
      [workEventId, at, RETRY_WINDOW_MIN]
    )).rows[0].n;
    if (n >= RETRY_THRESHOLD) {
      const code: BlockerCode = taskType === 'generate_media' ? 'render_failures' : 'retry_loop';
      await client.query(
        `UPDATE bureau.work_events SET status = 'blocked', blocker_code = $2
         WHERE id = $1 AND status NOT IN ('shipped', 'rendered', 'abandoned')`,
        [workEventId, code]
      );
    }
  }
  return { status: 'recorded', work_event_id: workEventId, created, matched_by: matchedBy };
}

// ---------------------------------------------------------------------------
// Read side
// ---------------------------------------------------------------------------

export interface WorkUnit {
  id: string;
  user_id: string;
  email: string | null;
  discipline: string | null;
  project: string;
  task_type: string;
  tool: string;
  tools: string[];
  artifact_link: string | null;
  status: string;
  blocker: string | null;
  effort: Record<string, number>;
  evidence: string[];
  confidence: string;
  title: string | null;       // null when hidden
  hidden: boolean;
  signals: number;
  started_at: string;
  last_seen_at: string;
}

export interface WorkQuery {
  workspaceId: string;
  userIds?: string[] | null;
  project?: string | null;
  status?: string | null;
  since?: string | null;
  until?: string | null;
  verifiedOnly?: boolean;
  limit?: number;
}

export const BLOCKER_LABELS: Record<string, string> = {
  retry_loop: 'Repeated failed attempts',
  stuck_keyword: 'Said they are stuck',
  deploy_failed: 'Deploy failed',
  error_assigned: 'Error assigned',
  render_failures: 'Repeated failed renders',
  review_wait: 'Waiting on review',
};

const toIso = (d: any) => new Date(d).toISOString();
const num = (v: any) => (v === null || v === undefined ? 0 : Number(v));

function decryptTitle(r: any, workspaceId: string): string | null {
  if (r.hidden_at || !r.title_enc) return null;
  try { return decryptScoped('work', r.title_enc, [workspaceId, r.user_id]); } catch { return '[unreadable: encryption key changed]'; }
}

export async function listWorkUnits(client: Queryable, q: WorkQuery): Promise<WorkUnit[]> {
  const limit = Math.min(Math.max(Number(q.limit) || 100, 1), 500);
  const userIds = (q.userIds || []).filter(u => UUID_RE.test(u));
  if (q.userIds && q.userIds.length > 0 && userIds.length === 0) return [];
  const since = q.since && !Number.isNaN(Date.parse(q.since)) ? new Date(q.since).toISOString() : null;
  const until = q.until && !Number.isNaN(Date.parse(q.until)) ? new Date(q.until).toISOString() : null;
  const rows = (await client.query(
    `SELECT e.*, (SELECT wm.email FROM bureau.workspace_members wm
                  WHERE wm.workspace_id = e.workspace_id AND wm.user_id = e.user_id LIMIT 1) AS email
     FROM bureau.work_events e
     WHERE e.workspace_id = $1 AND e.expires_at > NOW()
       AND ($2::uuid[] IS NULL OR e.user_id = ANY($2::uuid[]))
       AND ($3::text IS NULL OR e.project = $3)
       AND ($4::text IS NULL OR e.status = $4)
       AND ($5::timestamptz IS NULL OR e.last_seen_at >= $5)
       AND ($6::timestamptz IS NULL OR e.started_at <= $6)
       AND (NOT $7::boolean OR e.confidence = 'verified_artifact')
     ORDER BY e.last_seen_at DESC
     LIMIT $8`,
    [q.workspaceId, userIds.length ? userIds : null, q.project || null, q.status || null, since, until, q.verifiedOnly === true, limit]
  )).rows;
  return rows.map(r => ({
    id: r.id,
    user_id: r.user_id,
    email: r.email ?? null,
    discipline: r.discipline,
    project: r.project,
    task_type: r.task_type,
    tool: r.tool,
    tools: r.tools || [],
    artifact_link: r.hidden_at ? null : r.artifact_link,
    status: r.status,
    blocker: r.blocker_code ? (BLOCKER_LABELS[r.blocker_code] || r.blocker_code) : null,
    effort: Object.fromEntries(Object.entries(r.effort || {}).map(([k, v]) => [k, Number(v)])),
    evidence: r.source_kinds || [],
    confidence: r.confidence,
    title: decryptTitle(r, q.workspaceId),
    hidden: !!r.hidden_at,
    signals: r.signal_count,
    started_at: toIso(r.started_at),
    last_seen_at: toIso(r.last_seen_at),
  }));
}

export interface TeamBoard {
  window_days: number;
  totals: { units: number; shipped: number; blocked: number; in_progress: number; verified: number; correlated: number; self_reported: number };
  people: Array<{ user_id: string; email: string | null; units: number; shipped: number; blocked: number; projects: string[]; last_seen_at: string | null; consent_accepted: boolean }>;
  projects: Array<{ project: string; units: number; shipped: number; blocked: number; people: number }>;
  throughput: Array<{ day: string; shipped: number; units: number }>;
  blocked: WorkUnit[];
  tools: Array<{ tool: string; units: number; prompts: number; credits: number; chars: number; generations: number }>;
}

/** Team rollup for owners/admins (RLS limits members to their own rows, so a member gets only themselves). */
export async function teamBoard(client: Queryable, workspaceId: string, opts: { days?: number; project?: string | null } = {}): Promise<TeamBoard> {
  const days = Math.min(Math.max(Math.floor(Number(opts.days) || 7), 1), ACTIVITY_RETENTION_DAYS);
  const project = opts.project || null;
  const params = [workspaceId, days, project];
  const base = `FROM bureau.work_events e WHERE e.workspace_id = $1 AND e.expires_at > NOW()
                AND e.last_seen_at >= NOW() - make_interval(days => $2) AND ($3::text IS NULL OR e.project = $3)`;
  const totals = (await client.query(
    `SELECT count(*)::int AS units,
            count(*) FILTER (WHERE status IN ('shipped','rendered'))::int AS shipped,
            count(*) FILTER (WHERE status = 'blocked')::int AS blocked,
            count(*) FILTER (WHERE status IN ('in_progress','needs_review'))::int AS in_progress,
            count(*) FILTER (WHERE confidence = 'verified_artifact')::int AS verified,
            count(*) FILTER (WHERE confidence = 'correlated')::int AS correlated,
            count(*) FILTER (WHERE confidence = 'self_reported')::int AS self_reported ${base}`, params
  )).rows[0];
  const people = (await client.query(
    `SELECT wm.user_id, wm.email,
            count(e.id)::int AS units,
            count(e.id) FILTER (WHERE e.status IN ('shipped','rendered'))::int AS shipped,
            count(e.id) FILTER (WHERE e.status = 'blocked')::int AS blocked,
            COALESCE(array_agg(DISTINCT e.project) FILTER (WHERE e.project IS NOT NULL), '{}') AS projects,
            MAX(e.last_seen_at) AS last_seen_at,
            EXISTS (SELECT 1 FROM bureau.activity_consents c WHERE c.workspace_id = wm.workspace_id AND c.user_id = wm.user_id
                    AND c.policy_version = $4 AND c.revoked_at IS NULL) AS consent_accepted
     FROM bureau.workspace_members wm
     LEFT JOIN bureau.work_events e ON e.workspace_id = wm.workspace_id AND e.user_id = wm.user_id AND e.expires_at > NOW()
          AND e.last_seen_at >= NOW() - make_interval(days => $2) AND ($3::text IS NULL OR e.project = $3)
     WHERE wm.workspace_id = $1 AND wm.removed_at IS NULL AND wm.user_id IS NOT NULL
       AND (bureau.is_workspace_leader($1) OR wm.user_id = NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid)
     GROUP BY wm.user_id, wm.email, wm.workspace_id
     ORDER BY count(e.id) DESC, wm.email`,
    [...params, ACTIVITY_POLICY_VERSION]
  )).rows;
  const projects = (await client.query(
    `SELECT project, count(*)::int AS units,
            count(*) FILTER (WHERE status IN ('shipped','rendered'))::int AS shipped,
            count(*) FILTER (WHERE status = 'blocked')::int AS blocked,
            count(DISTINCT user_id)::int AS people ${base}
     GROUP BY project ORDER BY count(*) DESC, project`, params
  )).rows;
  const throughput = (await client.query(
    `SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
            count(e.id) FILTER (WHERE e.status IN ('shipped','rendered'))::int AS shipped,
            count(e.id)::int AS units
     FROM generate_series((NOW() - make_interval(days => $2 - 1))::date, NOW()::date, interval '1 day') AS d(day)
     LEFT JOIN bureau.work_events e ON e.workspace_id = $1 AND e.expires_at > NOW()
          AND e.last_seen_at::date = d.day::date AND ($3::text IS NULL OR e.project = $3)
     GROUP BY d.day ORDER BY d.day`, params
  )).rows;
  const tools = (await client.query(
    `SELECT t.tool, count(*)::int AS units,
            COALESCE(sum((e.effort->>'prompts')::numeric) FILTER (WHERE t.tool = e.tool OR array_length(e.tools,1) = 1), 0) AS prompts,
            COALESCE(sum((e.effort->>'credits')::numeric) FILTER (WHERE t.tool = 'higgsfield'), 0) AS credits,
            COALESCE(sum((e.effort->>'chars')::numeric) FILTER (WHERE t.tool = 'elevenlabs'), 0) AS chars,
            COALESCE(sum((e.effort->>'generations')::numeric) FILTER (WHERE t.tool IN ('higgsfield','elevenlabs')), 0) AS generations
     FROM bureau.work_events e, unnest(e.tools) AS t(tool)
     WHERE e.workspace_id = $1 AND e.expires_at > NOW() AND e.last_seen_at >= NOW() - make_interval(days => $2)
       AND ($3::text IS NULL OR e.project = $3)
     GROUP BY t.tool ORDER BY count(*) DESC, t.tool`, params
  )).rows;
  const blocked = await listWorkUnits(client, { workspaceId, status: 'blocked', project, since: new Date(Date.now() - days * 86400_000).toISOString(), limit: 50 });
  return {
    window_days: days,
    totals,
    people: people.map(p => ({ ...p, projects: p.projects || [], last_seen_at: p.last_seen_at ? toIso(p.last_seen_at) : null })),
    projects,
    throughput,
    blocked,
    tools: tools.map(t => ({ tool: t.tool, units: t.units, prompts: num(t.prompts), credits: num(t.credits), chars: num(t.chars), generations: num(t.generations) })),
  };
}

export interface Digest {
  period: 'daily' | 'weekly';
  since: string;
  generated_at: string;
  counts: { shipped: number; in_flight: number; blocked: number; people_active: number };
  shipped: WorkUnit[];
  in_flight: WorkUnit[];
  blocked: WorkUnit[];
  by_project: Array<{ project: string; shipped: number; in_flight: number; blocked: number }>;
  coverage: { not_accepted: Array<{ email: string | null }>; no_activity: Array<{ email: string | null }> };
  lines: string[];
}

/** Daily (24h) or weekly (7d) digest built purely from work units (no LLM). */
export async function buildDigest(client: Queryable, workspaceId: string, period: 'daily' | 'weekly', userIds?: string[] | null): Promise<Digest> {
  const hours = period === 'weekly' ? 24 * 7 : 24;
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const units = await listWorkUnits(client, { workspaceId, userIds, since, limit: 500 });
  const visible = units.filter(u => !u.hidden);
  const shipped = visible.filter(u => u.status === 'shipped' || u.status === 'rendered');
  const blocked = visible.filter(u => u.status === 'blocked');
  const inFlight = visible.filter(u => u.status === 'in_progress' || u.status === 'needs_review');
  const byProject = new Map<string, { project: string; shipped: number; in_flight: number; blocked: number }>();
  for (const u of visible) {
    const p = byProject.get(u.project) || { project: u.project, shipped: 0, in_flight: 0, blocked: 0 };
    if (shipped.includes(u)) p.shipped++; else if (blocked.includes(u)) p.blocked++; else if (inFlight.includes(u)) p.in_flight++;
    byProject.set(u.project, p);
  }
  const board = await teamBoard(client, workspaceId, { days: period === 'weekly' ? 7 : 1 });
  const people = userIds && userIds.length ? board.people.filter(p => userIds.includes(p.user_id)) : board.people;
  const who = (u: WorkUnit) => (u.email || 'someone').split('@')[0];
  const lines = [
    `${period === 'weekly' ? 'Last 7 days' : 'Last 24 hours'}: ${shipped.length} shipped, ${inFlight.length} in flight, ${blocked.length} blocked.`,
    ...shipped.slice(0, 10).map(u => `Shipped - ${who(u)} - ${u.project}: ${u.title}${u.artifact_link ? ` (${u.artifact_link})` : ''}`),
    ...blocked.slice(0, 10).map(u => `Blocked - ${who(u)} - ${u.project}: ${u.title} (${u.blocker || 'blocked'})`),
  ];
  return {
    period,
    since,
    generated_at: new Date().toISOString(),
    counts: { shipped: shipped.length, in_flight: inFlight.length, blocked: blocked.length, people_active: new Set(visible.map(u => u.user_id)).size },
    shipped: shipped.slice(0, 50),
    in_flight: inFlight.slice(0, 50),
    blocked: blocked.slice(0, 50),
    by_project: [...byProject.values()].sort((a, b) => (b.shipped + b.in_flight + b.blocked) - (a.shipped + a.in_flight + a.blocked)),
    coverage: {
      not_accepted: people.filter(p => !p.consent_accepted).map(p => ({ email: p.email })),
      no_activity: people.filter(p => p.consent_accepted && p.units === 0).map(p => ({ email: p.email })),
    },
    lines,
  };
}

/** Mark one of YOUR units personal: title, detail and link are erased for good; a dated stub remains. */
export async function hideWorkUnit(client: Queryable, id: string, userId: string): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  const res = await client.query(
    `UPDATE bureau.work_events SET hidden_at = NOW(), title_enc = NULL, detail_enc = NULL, artifact_link = NULL
     WHERE id = $1 AND user_id = $2 AND hidden_at IS NULL RETURNING id`,
    [id, userId]
  );
  return res.rows.length > 0;
}

export async function deleteWorkUnit(client: Queryable, id: string, userId: string): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  const res = await client.query(`DELETE FROM bureau.work_events WHERE id = $1 AND user_id = $2 RETURNING id`, [id, userId]);
  return res.rows.length > 0;
}
