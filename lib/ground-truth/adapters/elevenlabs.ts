/* eslint-disable @typescript-eslint/no-explicit-any -- vendor JSON and pg rows are untyped; every field is narrowed before use */
/**
 * ElevenLabs speech history -> signals (personal integration: the person's own API key).
 * GET https://api.elevenlabs.io/v1/history (header xi-api-key), documented at
 * https://elevenlabs.io/docs/api-reference/history/list : params page_size (<=1000),
 * start_after_history_item_id, date_after_unix (inclusive); response history[] with
 * history_item_id, date_unix, character_count_change_from/_to, model_id, voice_name, source,
 * text; has_more, last_history_item_id. Music and SFX are not in this endpoint (per the docs).
 * We keep the voice, source, character count and time. The spoken text is used only to guess the
 * project (alias match) and is never stored.
 */
import type { ParsedSignal } from '../types';

export const ELEVENLABS_HISTORY_URL = 'https://api.elevenlabs.io/v1/history';
const MAX_PAGES = 10;

export function elevenlabsItemToSignal(item: any): ParsedSignal | null {
  if (!item?.history_item_id || typeof item.date_unix !== 'number') return null;
  const chars = Math.max(0, Number(item.character_count_change_to) - Number(item.character_count_change_from)) || 0;
  const source = typeof item.source === 'string' ? item.source : 'TTS';
  return {
    provider: 'elevenlabs', sourceKind: 'api_sync', tool: 'elevenlabs', taskType: 'generate_media',
    externalId: `history:${item.history_item_id}`,
    occurredAt: new Date(item.date_unix * 1000),
    title: `ElevenLabs ${source}${item.voice_name ? ` - ${String(item.voice_name).slice(0, 60)}` : ''}${chars ? ` (${chars} chars)` : ''}`,
    classifyText: typeof item.text === 'string' ? item.text.slice(0, 2000) : '',
    status: 'rendered',
    effort: { generations: 1, ...(chars ? { chars } : {}) },
    actor: { provider: 'elevenlabs', externalIds: [], emails: [] }, // personal integration: owner is the actor
  };
}

/** Fetch history items newer than sinceUnix (inclusive). Returns signals + the new cursor. */
export async function fetchElevenlabs(apiKey: string, sinceUnix: number): Promise<{ signals: ParsedSignal[]; cursor: number }> {
  const signals: ParsedSignal[] = [];
  let cursor = sinceUnix;
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const u = new URL(ELEVENLABS_HISTORY_URL);
    u.searchParams.set('page_size', '100');
    u.searchParams.set('date_after_unix', String(sinceUnix));
    if (after) u.searchParams.set('start_after_history_item_id', after);
    const res = await fetch(u.toString(), { headers: { 'xi-api-key': apiKey, accept: 'application/json' } });
    if (!res.ok) throw new Error(`ElevenLabs history returned ${res.status}`);
    const body: any = await res.json();
    for (const item of Array.isArray(body?.history) ? body.history : []) {
      const s = elevenlabsItemToSignal(item);
      if (s) { signals.push(s); cursor = Math.max(cursor, item.date_unix); }
    }
    if (!body?.has_more || !body?.last_history_item_id) break;
    after = String(body.last_history_item_id);
  }
  return { signals, cursor };
}
