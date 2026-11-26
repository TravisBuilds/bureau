/* eslint-disable @typescript-eslint/no-explicit-any -- vendor JSON and pg rows are untyped; every field is narrowed before use */
/**
 * Server-side ingestion: verified webhooks and scheduled syncs -> recordSignal under the resolved
 * person's RLS context. Nothing is written for a signal we can't attribute to an active member who
 * has accepted the current notice: it is dropped, not parked.
 */
import { query, withUser } from '../db';
import { decryptScoped } from '../activity-crypto';
import { ACTIVITY_POLICY_VERSION } from '../activity-policy';
import { recordSignal, type RecordResult } from './work-events';
import type { ActorRef, ParsedSignal, Provider } from './types';
import { parseGithub } from './adapters/github';
import { parseVercel } from './adapters/vercel';
import { parseLinear } from './adapters/linear';
import { parseSentry } from './adapters/sentry';
import { verifyGithub, verifyLinear, verifySentry, verifyVercel, LINEAR_MAX_SKEW_MS } from './verify';
import { fetchElevenlabs } from './adapters/elevenlabs';
import { fetchHiggsfield } from './adapters/higgsfield';
import { fetchDrive } from './adapters/google-drive';

export interface IngestSummary { received: number; recorded: number; duplicate: number; dropped: number }
const emptySummary = (): IngestSummary => ({ received: 0, recorded: 0, duplicate: 0, dropped: 0 });

async function resolveActor(workspaceId: string, ref: ActorRef): Promise<{ user_id: string; email: string } | null> {
  for (let r: ActorRef | undefined = ref; r; r = r.fallback) {
    if (!r.externalIds.length && !r.emails.length) continue;
    const rows = await query<{ user_id: string; email: string }>(
      'SELECT * FROM bureau.gt_resolve_actor($1, $2, $3, $4, $5)',
      [workspaceId, r.provider, r.externalIds, r.emails, ACTIVITY_POLICY_VERSION]
    );
    if (rows[0]?.user_id) return rows[0];
  }
  return null;
}


async function apply(workspaceId: string, projectMap: Record<string, string> | undefined, user: { user_id: string; email: string }, sig: ParsedSignal, sum: IngestSummary) {
  const res: RecordResult = await withUser(user.user_id, user.email, c =>
    recordSignal(c, { workspaceId, userId: user.user_id, projectMap }, sig)
  );
  if (res.status === 'recorded') sum.recorded++;
  else if (res.status === 'duplicate') sum.duplicate++;
  else sum.dropped++;
}

export type WebhookOutcome =
  | { ok: true; status: number; summary: IngestSummary }
  | { ok: false; status: number; error: string };

/** Verify + parse + record one webhook delivery. `headers` keys must be lower-case. */
export async function handleWebhook(provider: Provider, integrationId: string, headers: Record<string, string | null>, raw: string, now = Date.now()): Promise<WebhookOutcome> {
  const row = (await query<{ workspace_id: string; secret_enc: string; config: any }>(
    'SELECT * FROM bureau.gt_integration_for_webhook($1, $2)', [integrationId, provider]
  ))[0];
  if (!row) return { ok: false, status: 404, error: 'Unknown webhook' };
  let secret: string;
  try {
    secret = decryptScoped('integration', row.secret_enc, [row.workspace_id, integrationId]);
  } catch {
    return { ok: false, status: 500, error: 'Webhook secret unavailable' };
  }
  const valid =
    provider === 'github' ? verifyGithub(secret, raw, headers['x-hub-signature-256']) :
    provider === 'vercel' ? verifyVercel(secret, raw, headers['x-vercel-signature']) :
    provider === 'linear' ? verifyLinear(secret, raw, headers['linear-signature']) :
    provider === 'sentry' ? verifySentry(secret, raw, headers['sentry-hook-signature']) : false;
  if (!valid) return { ok: false, status: 401, error: 'Bad signature' };

  let body: any;
  try { body = JSON.parse(raw); } catch { return { ok: false, status: 400, error: 'Invalid JSON' }; }

  let signals: ParsedSignal[] = [];
  if (provider === 'github') signals = parseGithub(headers['x-github-event'] || '', headers['x-github-delivery'] || '', body);
  else if (provider === 'vercel') signals = parseVercel(body);
  else if (provider === 'linear') {
    const ts = Number(body?.webhookTimestamp);
    if (!Number.isFinite(ts) || Math.abs(now - ts) > LINEAR_MAX_SKEW_MS) return { ok: false, status: 401, error: 'Stale delivery' };
    signals = parseLinear(headers['linear-delivery'] || '', body);
  } else if (provider === 'sentry') signals = parseSentry(headers['sentry-hook-resource'] || '', headers['request-id'] || '', body);

  const sum = emptySummary();
  const projectMap = row.config?.project_map || undefined;
  for (const sig of signals.slice(0, 200)) {
    sum.received++;
    const who = await resolveActor(row.workspace_id, sig.actor);
    if (!who) { sum.dropped++; continue; }
    await apply(row.workspace_id, projectMap, who, sig, sum);
  }
  await query('SELECT bureau.gt_mark_integration($1, true, NULL, NULL, false)', [integrationId]);
  return { ok: true, status: 200, summary: sum };
}

export interface SyncResult { integration_id: string; provider: string; ok: boolean; error?: string; summary: IngestSummary }

/** Pull Drive / ElevenLabs / Higgsfield for every active integration (or just one). */
export async function runSync(onlyId: string | null = null, now = Date.now()): Promise<SyncResult[]> {
  const targets = await query<any>('SELECT * FROM bureau.gt_sync_targets($1)', [onlyId]);
  const out: SyncResult[] = [];
  for (const t of targets) {
    const sum = emptySummary();
    try {
      const cred = decryptScoped('integration', t.credential_enc, [t.workspace_id, t.id]);
      let fetched: { signals: ParsedSignal[]; cursor: string };
      if (t.provider === 'elevenlabs') {
        const since = Number(t.sync_cursor) || Math.floor((now - 24 * 3600_000) / 1000);
        const r = await fetchElevenlabs(cred, since);
        fetched = { signals: r.signals, cursor: String(r.cursor) };
      } else if (t.provider === 'higgsfield') {
        fetched = await fetchHiggsfield(cred, t.sync_cursor, now);
      } else {
        fetched = await fetchDrive(cred, t.sync_cursor, t.config?.folder_id || null, now);
      }
      const projectMap = t.config?.project_map || undefined;
      const owner = t.owner_user_id
        ? await resolveOwner(t.workspace_id, t.owner_user_id)
        : null;
      for (const sig of fetched.signals.slice(0, 2000)) {
        sum.received++;
        const who = t.owner_user_id ? owner : await resolveActor(t.workspace_id, sig.actor);
        if (!who) { sum.dropped++; continue; }
        await apply(t.workspace_id, projectMap, who, sig, sum);
      }
      await query('SELECT bureau.gt_mark_integration($1, true, NULL, $2, true)', [t.id, fetched.cursor]);
      out.push({ integration_id: t.id, provider: t.provider, ok: true, summary: sum });
    } catch (e: any) {
      const msg = String(e?.message || 'sync failed').slice(0, 300);
      await query('SELECT bureau.gt_mark_integration($1, false, $2, NULL, true)', [t.id, msg]);
      out.push({ integration_id: t.id, provider: t.provider, ok: false, error: msg, summary: sum });
    }
  }
  return out;
}

/** Personal integrations always belong to their owner; still requires active membership + current consent. */
async function resolveOwner(workspaceId: string, userId: string): Promise<{ user_id: string; email: string } | null> {
  const rows = await query<{ user_id: string; email: string }>(
    'SELECT * FROM bureau.gt_resolve_owner($1, $2, $3)', [workspaceId, userId, ACTIVITY_POLICY_VERSION]
  );
  return rows[0]?.user_id ? rows[0] : null;
}
