/**
 * Pure Events API router: decide what a verified payload means before touching the database.
 */
import { cleanSlackText } from './commands';

export type EventRoute =
  | { action: 'url_verification'; challenge: string }
  | { action: 'ignore'; reason: string }
  | { action: 'uninstalled'; teamId: string; eventId: string | null }
  | { action: 'tokens_revoked'; teamId: string; eventId: string | null; botUserIds: string[] }
  | {
      action: 'command';
      surface: 'mention' | 'dm';
      teamId: string;
      eventId: string | null;
      user: string;
      channel: string;
      ts: string;
      threadTs: string | null;
      text: string; // raw Slack text (cleaned later, once the bot user id is known)
    };

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped Slack JSON
export function routeEvent(payload: any): EventRoute {
  if (!payload || typeof payload !== 'object') return { action: 'ignore', reason: 'not_json' };
  if (payload.type === 'url_verification') {
    return typeof payload.challenge === 'string' ? { action: 'url_verification', challenge: payload.challenge.slice(0, 200) } : { action: 'ignore', reason: 'no_challenge' };
  }
  if (payload.type !== 'event_callback') return { action: 'ignore', reason: 'not_event_callback' };
  const teamId = typeof payload.team_id === 'string' ? payload.team_id : '';
  if (!/^[TE][A-Z0-9]+$/.test(teamId)) return { action: 'ignore', reason: 'no_team' };
  const eventId = typeof payload.event_id === 'string' ? payload.event_id.slice(0, 100) : null;
  const ev = payload.event || {};

  if (ev.type === 'app_uninstalled') return { action: 'uninstalled', teamId, eventId };
  if (ev.type === 'tokens_revoked') {
    const bots = Array.isArray(ev.tokens?.bot) ? ev.tokens.bot.filter((b: unknown) => typeof b === 'string') : [];
    return { action: 'tokens_revoked', teamId, eventId, botUserIds: bots };
  }

  // Never react to bots (including ourselves) or to edits/joins/etc.
  if (ev.bot_id || ev.bot_profile || ev.subtype) return { action: 'ignore', reason: 'bot_or_subtype' };
  const user = typeof ev.user === 'string' ? ev.user : '';
  const channel = typeof ev.channel === 'string' ? ev.channel : '';
  const ts = typeof ev.ts === 'string' ? ev.ts : '';
  if (!/^[UW][A-Z0-9]+$/.test(user) || !channel || !ts) return { action: 'ignore', reason: 'missing_fields' };
  const text = typeof ev.text === 'string' ? ev.text : '';
  const threadTs = typeof ev.thread_ts === 'string' ? ev.thread_ts : null;

  if (ev.type === 'app_mention') {
    return { action: 'command', surface: 'mention', teamId, eventId, user, channel, ts, threadTs, text };
  }
  if (ev.type === 'message' && ev.channel_type === 'im') {
    return { action: 'command', surface: 'dm', teamId, eventId, user, channel, ts, threadTs, text };
  }
  return { action: 'ignore', reason: `unhandled_${String(ev.type || 'none').slice(0, 40)}` };
}

/** Text of a mention with the leading bot mention removed (works before we know our bot id). */
export function commandText(raw: string, botUserId: string | null): string {
  let t = cleanSlackText(raw, botUserId);
  // app_mention text starts with "<@BOT>"; if we did not know the id, drop a leading mention.
  if (!botUserId) t = t.replace(/^<@[UW][A-Z0-9]+(?:\|[^>]*)?>\s*/, '');
  return t.trim();
}
