/**
 * Deterministic command grammar shared by @Bureau mentions, DMs and /bureau. No LLM.
 *
 *   help
 *   status [who]                      latest check-ins (whole team, or one person)
 *   what is <who> working on?         same as status <who>
 *   ask <who> <question>              post a question to a teammate's AI (+ their latest check-in)
 *   @<who> <question>                 same as ask
 *   questions [who]                   open questions for you, or questions asked of <who>
 *   answer <id> <text>                answer a question asked of your AI (id = first 8 chars)
 *   board [days]                      Team Work Board (owners/admins)
 *   digest [daily|weekly] [who]       work digest (owners/admins)
 */

export type SlackCommand =
  | { kind: 'help' }
  | { kind: 'status'; who: string | null }
  | { kind: 'ask'; who: string; question: string }
  | { kind: 'questions'; who: string | null }
  | { kind: 'answer'; ref: string; text: string }
  | { kind: 'board'; days: number }
  | { kind: 'digest'; period: 'daily' | 'weekly'; who: string | null }
  | { kind: 'usage'; command: string }
  | { kind: 'unknown'; text: string };

export const MAX_QUESTION_CHARS = 2000;
const WHO = String.raw`(<@[UW][A-Z0-9]+(?:\|[^>]*)?>|@?[A-Za-z0-9][A-Za-z0-9._'@+-]*)`;

/** Normalise Slack message markup: links and mailto become plain text; user mentions stay. */
export function cleanSlackText(text: string, botUserId?: string | null): string {
  let t = String(text || '');
  if (botUserId) t = t.split(`<@${botUserId}>`).join(' ');
  t = t
    .replace(/<mailto:([^|>]+)(?:\|[^>]*)?>/g, '$1')
    .replace(/<(https?:\/\/[^|>]+)(?:\|[^>]*)?>/g, '$1')
    .replace(/<#[A-Z0-9]+(?:\|([^>]*))?>/g, (_m, name) => (name ? `#${name}` : '#channel'))
    .replace(/<!(here|channel|everyone)[^>]*>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/[\u00a0\s]+/g, ' ')
    .trim();
  return t;
}

/** Slack user id from a "<@U123>" or "<@U123|name>" token, else null. */
export function mentionedUserId(token: string): string | null {
  const m = /^<@([UW][A-Z0-9]+)(?:\|[^>]*)?>$/.exec(String(token || '').trim());
  return m ? m[1] : null;
}

const strip = (s: string) => s.trim().replace(/[?.!]+$/, '').trim();

export function parseCommand(input: string): SlackCommand {
  const text = String(input || '').trim();
  if (!text || /^(help|\?|hi|hello|hey)$/i.test(text)) return { kind: 'help' };

  const [rawVerb, ...rest] = text.split(' ');
  const verb = rawVerb.toLowerCase();
  const tail = rest.join(' ').trim();

  if (verb === 'status' || verb === 'checkin' || verb === 'check-in' || verb === 'checkins') {
    return { kind: 'status', who: tail ? strip(tail) : null };
  }
  const working = /^(?:what(?:'|\u2019)?s|what\s+is|whats)\s+(.+?)\s+(?:working\s+on|up\s+to|doing)\s*\??$/i.exec(text);
  if (working) return { kind: 'status', who: strip(working[1]) };

  if (verb === 'ask') {
    const m = new RegExp(`^${WHO}[:,]?\\s+([\\s\\S]+)$`).exec(tail);
    if (!m || !m[2].trim()) return { kind: 'usage', command: 'ask' };
    return { kind: 'ask', who: m[1], question: m[2].trim().slice(0, MAX_QUESTION_CHARS) };
  }
  if (verb === 'questions' || verb === 'q') return { kind: 'questions', who: tail ? strip(tail) : null };
  if (verb === 'answer' || verb === 'reply') {
    const m = /^([0-9a-f]{6,36})\s+([\s\S]+)$/i.exec(tail);
    if (!m) return { kind: 'usage', command: 'answer' };
    return { kind: 'answer', ref: m[1].toLowerCase(), text: m[2].trim().slice(0, 4000) };
  }
  if (verb === 'board' || (verb === 'team' && (!tail || /^board\b/i.test(tail)))) {
    const n = /(\d{1,2})/.exec(tail);
    return { kind: 'board', days: Math.min(Math.max(n ? parseInt(n[1], 10) : 7, 1), 30) };
  }
  if (verb === 'digest') {
    const words = tail.split(' ').filter(Boolean);
    let period: 'daily' | 'weekly' = 'daily';
    if (words[0] && /^(daily|today|day|weekly|week)$/i.test(words[0])) {
      period = /^week/i.test(words[0]) ? 'weekly' : 'daily';
      words.shift();
    }
    return { kind: 'digest', period, who: words.length ? strip(words.join(' ')) : null };
  }

  // "@jack is the release on track?" / "<@U123> is the release on track?"
  const direct = new RegExp(`^(<@[UW][A-Z0-9]+(?:\\|[^>]*)?>|@[A-Za-z0-9][A-Za-z0-9._-]*)\\s+([\\s\\S]+)$`).exec(text);
  if (direct) return { kind: 'ask', who: direct[1], question: direct[2].trim().slice(0, MAX_QUESTION_CHARS) };

  return { kind: 'unknown', text };
}

export const HELP_LINES = [
  '*status* `[who]`: latest check-ins for the team, or one person',
  '*what is* `<who>` *working on?*: same as status',
  '*ask* `<who> <question>`: ask a teammate\'s AI (you get their latest check-in now; their AI answers at its next check-in)',
  '*questions* `[who]`: your open questions, or what has been asked of someone',
  '*answer* `<id> <text>`: answer a question asked of your AI',
  '*board* `[days]`: Team Work Board (owners and admins)',
  '*digest* `[daily|weekly] [who]`: shipped, in-flight and blocked work (owners and admins)',
];
