/* eslint-disable @typescript-eslint/no-explicit-any -- vendor JSON and pg rows are untyped; every field is narrowed before use */
/**
 * Higgsfield Organization API usage report -> signals (workspace-level integration; needs an
 * organization key with the read:usage permission, which Higgsfield documents for Enterprise
 * organizations): GET https://fnf-api-gw.higgsfield.ai/fnf/v1/organization/generation_usage_report
 * Docs: https://higgsfield.ai/enterprise-help-center/manage-account/usage-analytics
 *  - headers x-api-key, User-Agent; params starting_at (required, RFC 3339, not before
 *    2026-02-01), ending_at (<= starting_at + 31 days), limit (1-1000), page (= next_page)
 *  - rows: id, type (generation|charge), created_at, actor{user_id,email_address,name}, model,
 *    model_name, credits (decimal string), state (queued|running|succeeded|failed|canceled),
 *    completed_at, failed_at, output_type, projects[{id,name}]
 * We use the usage report only (no read:content key): prompts and media are never fetched.
 * Only final states are recorded (succeeded -> rendered; failed -> a failed attempt that counts
 * toward the retry-loop rule). Each sync re-reads a 2-hour overlap so generations that finish late
 * are picked up; dedupe on row id makes the overlap safe.
 * Note: this is the organization (team) account. Credits from the Higgsfield MCP/app balance and
 * from a separately billed harness API key are different books; we never convert credits to USD.
 */
import type { ParsedSignal } from '../types';

export const HIGGSFIELD_USAGE_URL = 'https://fnf-api-gw.higgsfield.ai/fnf/v1/organization/generation_usage_report';
export const HIGGSFIELD_EARLIEST = Date.parse('2026-02-01T00:00:00Z');
const OVERLAP_MS = 2 * 3600_000;
const MAX_WINDOW_MS = 31 * 86400_000;
const MAX_PAGES = 10;

export function higgsfieldRowToSignal(row: any): ParsedSignal | null {
  if (row?.type !== 'generation' || !row.id) return null;
  const state = String(row.state || '');
  if (state !== 'succeeded' && state !== 'failed') return null;
  const credits = Number.parseFloat(String(row.credits ?? '0'));
  const when = Date.parse(String(row.completed_at || row.failed_at || row.created_at || ''));
  const projects = Array.isArray(row.projects) ? row.projects.map((p: any) => String(p?.name || '')).filter(Boolean) : [];
  return {
    provider: 'higgsfield', sourceKind: 'api_sync', tool: 'higgsfield', taskType: 'generate_media',
    externalId: `generation:${row.id}`,
    occurredAt: Number.isNaN(when) ? new Date() : new Date(when),
    title: `Higgsfield ${String(row.model_name || row.model || 'generation').slice(0, 60)}${row.output_type ? ` ${row.output_type}` : ''}${state === 'failed' ? ' (failed)' : ''}`,
    projectHints: projects,
    status: state === 'succeeded' ? 'rendered' : null,
    failed: state === 'failed',
    effort: { generations: 1, ...(Number.isFinite(credits) && credits > 0 ? { credits } : {}), ...(state === 'failed' ? { failed_generations: 1 } : {}) },
    actor: {
      provider: 'higgsfield',
      externalIds: row.actor?.user_id ? [String(row.actor.user_id)] : [],
      emails: row.actor?.email_address ? [String(row.actor.email_address)] : [],
    },
  };
}

export async function fetchHiggsfield(apiKey: string, cursorIso: string | null, now = Date.now()): Promise<{ signals: ParsedSignal[]; cursor: string }> {
  let start = cursorIso && !Number.isNaN(Date.parse(cursorIso)) ? Date.parse(cursorIso) - OVERLAP_MS : now - 24 * 3600_000;
  start = Math.max(start, HIGGSFIELD_EARLIEST, now - MAX_WINDOW_MS + 60_000);
  const end = Math.min(now, start + MAX_WINDOW_MS - 60_000);
  const signals: ParsedSignal[] = [];
  let page: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const u = new URL(HIGGSFIELD_USAGE_URL);
    u.searchParams.set('starting_at', new Date(start).toISOString());
    u.searchParams.set('ending_at', new Date(end).toISOString());
    u.searchParams.set('limit', '1000');
    if (page) u.searchParams.set('page', page);
    const res = await fetch(u.toString(), { headers: { 'x-api-key': apiKey, 'User-Agent': 'bureau-ground-truth/1.0', accept: 'application/json' } });
    if (!res.ok) throw new Error(`Higgsfield usage report returned ${res.status}`);
    const body: any = await res.json();
    for (const row of Array.isArray(body?.data) ? body.data : []) {
      const s = higgsfieldRowToSignal(row);
      if (s) signals.push(s);
    }
    if (!body?.has_more || !body?.next_page) break;
    page = String(body.next_page);
  }
  return { signals, cursor: new Date(end).toISOString() };
}
