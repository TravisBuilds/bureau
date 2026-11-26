/* eslint-disable @typescript-eslint/no-explicit-any -- untyped Slack JSON and route-handler test doubles */
/**
 * Slack connect (Phase 1 install + Phase 2 reactive triggers).
 * ALL DATA HERE IS SAMPLE DATA (fake people, Slack ids, tokens and secrets), labelled "SAMPLE".
 * App code runs as bureau_app (DATABASE_URL); seeding uses the admin pool. No network: fetch is
 * stubbed and any call that is not a mocked Slack endpoint throws.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { Pool } from 'pg';
import {
  admin, q, uid, cleanup, createWorkspace, createUser, addMember, type Member, type Workspace,
} from './helpers/clone-fixtures';
import { ACTIVITY_POLICY_VERSION } from '../lib/activity-policy';

// ---- session mock (only the Supabase cookie session is faked) ----
let sessionUser: { id: string; email: string } | null = null;
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, delete: () => undefined }) }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: sessionUser } }) } }),
}));

const SIGNING = 'SAMPLE-signing-secret-' + randomBytes(8).toString('hex');
const CLIENT_SECRET = 'SAMPLE-client-secret-' + randomBytes(8).toString('hex');
process.env.SLACK_SIGNING_SECRET = SIGNING;
process.env.SLACK_CLIENT_ID = 'SAMPLE.client.id';
process.env.SLACK_CLIENT_SECRET = CLIENT_SECRET;
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.NEXT_PUBLIC_APP_URL = 'https://bureau.sample.invalid';
process.env.BUREAU_ACTIVITY_ENCRYPTION_KEY = randomBytes(32).toString('base64'); // throwaway, this run only
delete process.env.SLACK_BOT_TOKEN;
delete process.env.BUREAU_ENABLE_LLM_REVIEW;

// ---- fetch mock: Slack Web API + response_url only ----
type Call = { url: string; method: string; body: any; auth: string | null };
const calls: Call[] = [];
let slackHandlers: Record<string, (body: any, auth: string | null) => any> = {};
const parseBody = (init: any) => {
  const raw = init?.body ? String(init.body) : '';
  const ct = String(init?.headers?.['content-type'] || '');
  if (ct.includes('json')) return JSON.parse(raw || '{}');
  return Object.fromEntries(new URLSearchParams(raw));
};
vi.stubGlobal('fetch', async (url: any, init?: any) => {
  const u = String(url);
  const auth = init?.headers?.authorization ?? null;
  if (u.startsWith('https://slack.com/api/')) {
    const method = u.slice('https://slack.com/api/'.length);
    const body = parseBody(init);
    calls.push({ url: u, method, body, auth });
    const h = slackHandlers[method];
    const out = h ? h(body, auth) : { ok: true };
    return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (u.startsWith('https://hooks.slack.com/')) {
    calls.push({ url: u, method: 'response_url', body: JSON.parse(init?.body || '{}'), auth });
    return new Response('ok', { status: 200 });
  }
  throw new Error(`Unexpected network call in test: ${u}`);
});
const callsOf = (m: string) => calls.filter(c => c.method === m);

// ---- modules under test (imported after env + mocks) ----
let verifyMod: typeof import('../lib/slack/verify');
let stateMod: typeof import('../lib/slack/state');
let cryptoMod: typeof import('../lib/slack/token-crypto');
let eventsMod: typeof import('../lib/slack/events');
let commandsMod: typeof import('../lib/slack/commands');
let configMod: typeof import('../lib/slack/config');
let apiMod: typeof import('../lib/slack/api');
let drainBackground: () => Promise<void>;
let eventsPost: any, commandsPost: any, installGet: any, installDelete: any, callbackGet: any, statusGet: any, membersPost: any, membersPut: any;

// ---- sample world ----
let W: Workspace, W2: Workspace;
let ada: Member;   // W owner, linked by email at install
let jack: Member;  // W member, linked by email at install
let kim: Member;   // W member, Slack user linked lazily on first message
let lee: Member;   // W member, has NOT accepted the activity notice
let team: string;
const BOT = 'UBOTSAMPLE';
const BOT_TOKEN = 'xoxb-SAMPLE-' + randomBytes(10).toString('hex');
const SL = { ada: 'UADASAMPLE', jack: 'UJACKSAMPLE', kim: 'UKIMSAMPLE', lee: 'ULEESAMPLE', stranger: 'USTRANGER', ext: 'UEXTERNAL' };
let jackClone: string, w2Clone: string, w2Handle: string;
let slackUsers: Record<string, any> = {};

const nowTs = () => String(Math.floor(Date.now() / 1000));
const sign = (ts: string, raw: string) => verifyMod.computeSlackSignature(SIGNING, ts, raw);

async function postEvent(payload: any, opts: { ts?: string; sig?: string; retry?: string } = {}) {
  const raw = JSON.stringify(payload);
  const ts = opts.ts ?? nowTs();
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-slack-request-timestamp': ts, 'x-slack-signature': opts.sig ?? sign(ts, raw) };
  if (opts.retry) { headers['x-slack-retry-num'] = opts.retry; headers['x-slack-retry-reason'] = 'http_timeout'; }
  const res = await eventsPost(new NextRequest('http://localhost/api/slack/events', { method: 'POST', headers, body: raw }));
  const text = await res.text();
  await drainBackground();
  let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: res.status, body };
}

async function postSlash(fields: Record<string, string>, opts: { ts?: string; sig?: string } = {}) {
  const raw = new URLSearchParams(fields).toString();
  const ts = opts.ts ?? nowTs();
  const res = await commandsPost(new NextRequest('http://localhost/api/slack/commands', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-slack-request-timestamp': ts, 'x-slack-signature': opts.sig ?? sign(ts, raw) }, body: raw,
  }));
  const text = await res.text();
  await drainBackground();
  let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: res.status, body };
}

const mention = (user: string, text: string, t = team, extra: any = {}) => ({
  type: 'event_callback', team_id: t, event_id: `Ev${uid().toUpperCase()}`,
  event: { type: 'app_mention', user, text: `<@${BOT}> ${text}`, channel: 'CSAMPLE1', ts: `1795500${Math.floor(Math.random() * 1e6)}.000100`, ...extra },
});
const dm = (user: string, text: string) => ({
  type: 'event_callback', team_id: team, event_id: `Ev${uid().toUpperCase()}`,
  event: { type: 'message', channel_type: 'im', user, text, channel: 'DSAMPLE1', ts: `1795600${Math.floor(Math.random() * 1e6)}.000200` },
});

async function asUser(handler: any, user: Member | null, url: string, init: { method?: string; body?: any; cookie?: string } = {}) {
  sessionUser = user ? { id: user.userId, email: user.email } : null;
  try {
    const headers: Record<string, string> = {};
    if (init.cookie) headers.cookie = init.cookie;
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    const res = await handler(new NextRequest(url, { method: init.method || 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) }));
    await drainBackground();
    const text = await res.text();
    let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
    return { status: res.status, body, res, text };
  } finally { sessionUser = null; }
}

const accept = (ws: string, m: Member) =>
  q(`INSERT INTO bureau.activity_consents (workspace_id, user_id, policy_version, source, accepted_at)
     VALUES ($1, $2, $3, 'web', NOW() - INTERVAL '1 hour') ON CONFLICT (workspace_id, user_id, policy_version) DO UPDATE SET revoked_at = NULL`, [ws, m.userId, ACTIVITY_POLICY_VERSION]);
const slackLogs = (m: Member) => q(`SELECT * FROM bureau.activity_logs WHERE user_id = $1 AND source = 'slack' ORDER BY received_at`, [m.userId]);
const slackQuestions = (cloneId: string) => q(`SELECT * FROM bureau.questions WHERE target_clone_id = $1 AND source = 'slack' ORDER BY asked_at`, [cloneId]);

async function installAs(owner: Member, ws: string, teamId: string, teamName = 'SAMPLE Highstreet') {
  const start = await asUser(installGet, owner, 'https://bureau.sample.invalid/api/slack/install');
  const loc = new URL(start.res.headers.get('location'));
  const state = loc.searchParams.get('state')!;
  const setCookie = start.res.headers.get('set-cookie') || '';
  const nonce = /bureau_slack_oauth=([^;]+)/.exec(setCookie)?.[1] || '';
  slackHandlers['oauth.v2.access'] = () => ({
    ok: true, token_type: 'bot', access_token: BOT_TOKEN, scope: configMod.SLACK_BOT_SCOPES.join(','), bot_user_id: BOT,
    app_id: 'ASAMPLE', team: { id: teamId, name: teamName }, authed_user: { id: SL.ada }, is_enterprise_install: false,
  });
  const cb = await asUser(callbackGet, owner, `https://bureau.sample.invalid/api/slack/oauth/callback?code=SAMPLE-code&state=${encodeURIComponent(state)}`, { cookie: `bureau_slack_oauth=${nonce}` });
  return { start, cb, state, nonce, ws };
}

beforeAll(async () => {
  verifyMod = await import('../lib/slack/verify');
  stateMod = await import('../lib/slack/state');
  cryptoMod = await import('../lib/slack/token-crypto');
  eventsMod = await import('../lib/slack/events');
  commandsMod = await import('../lib/slack/commands');
  configMod = await import('../lib/slack/config');
  apiMod = await import('../lib/slack/api');
  ({ drainBackground } = await import('../lib/slack/background'));
  ({ POST: eventsPost } = await import('../app/api/slack/events/route'));
  ({ POST: commandsPost } = await import('../app/api/slack/commands/route'));
  ({ GET: installGet, DELETE: installDelete } = await import('../app/api/slack/install/route'));
  ({ GET: callbackGet } = await import('../app/api/slack/oauth/callback/route'));
  ({ GET: statusGet } = await import('../app/api/slack/status/route'));
  ({ POST: membersPost, PUT: membersPut } = await import('../app/api/slack/members/route'));

  W = await createWorkspace('slackW');
  ada = W.owner;
  jack = await createUser('jack'); await addMember(W.id, jack, 'member');
  kim = await createUser('kim'); await addMember(W.id, kim, 'member');
  lee = await createUser('lee'); await addMember(W.id, lee, 'member');
  W2 = await createWorkspace('slackW2');
  for (const m of [ada, jack, kim]) await accept(W.id, m);

  const [c] = await q(`INSERT INTO bureau.digital_clones (workspace_id, owner_user_id, display_name, handle, vendor, last_seen_at)
                       VALUES ($1, $2, 'Jack (SAMPLE)', $3, 'anthropic', NOW()) RETURNING id`, [W.id, jack.userId, `jack-claude-${uid()}`]);
  jackClone = c.id;
  await q(`INSERT INTO bureau.clone_heartbeats (clone_id, date, top_priority, active, blocked)
           VALUES ($1, CURRENT_DATE, 'SAMPLE: ship the onboarding flow', ARRAY['SAMPLE docs'], ARRAY['SAMPLE waiting on legal'])`, [jackClone]);
  w2Handle = `zed-${uid()}`;
  const [c2] = await q(`INSERT INTO bureau.digital_clones (workspace_id, owner_user_id, display_name, handle, vendor)
                        VALUES ($1, $2, 'Zed (SAMPLE other workspace)', $3, 'openai') RETURNING id`, [W2.id, W2.owner.userId, w2Handle]);
  w2Clone = c2.id;

  team = `T${uid().toUpperCase()}`;
  slackUsers = {
    [SL.ada]: { id: SL.ada, team_id: team, profile: { email: ada.email.toUpperCase(), display_name: 'ada' } },
    [SL.jack]: { id: SL.jack, team_id: team, profile: { email: jack.email, display_name: 'jack' } },
    [SL.kim]: { id: SL.kim, team_id: team, profile: { email: kim.email, display_name: 'kim' } },
    [SL.lee]: { id: SL.lee, team_id: team, profile: { email: lee.email, display_name: 'lee' } },
    [SL.stranger]: { id: SL.stranger, team_id: team, profile: { email: 'stranger@sample.invalid', display_name: 'stranger' } },
    [SL.ext]: { id: SL.ext, team_id: 'TOTHERORG', profile: { email: jack.email, display_name: 'external jack' } },
  };
  slackHandlers = {
    'users.list': () => ({ ok: true, members: [slackUsers[SL.ada], slackUsers[SL.jack], slackUsers[SL.stranger], slackUsers[SL.ext], { id: 'UBOTX', is_bot: true, team_id: team, profile: {} }], response_metadata: { next_cursor: '' } }),
    'users.info': (b) => (slackUsers[b.user] ? { ok: true, user: slackUsers[b.user] } : { ok: false, error: 'user_not_found' }),
  };
});

afterAll(async () => {
  await cleanup();
  await admin.end();
});

beforeEach(() => { calls.length = 0; });

// ===========================================================================
describe('signature verification + replay window (unit)', () => {
  it('accepts a correct v0 signature and rejects tampering', () => {
    const ts = nowTs();
    const body = '{"type":"event_callback"}';
    expect(verifyMod.verifySlackRequest({ secret: SIGNING, rawBody: body, timestamp: ts, signature: sign(ts, body) })).toEqual({ ok: true });
    expect(verifyMod.verifySlackRequest({ secret: SIGNING, rawBody: body + ' ', timestamp: ts, signature: sign(ts, body) }).ok).toBe(false);
    expect(verifyMod.verifySlackRequest({ secret: 'other-secret', rawBody: body, timestamp: ts, signature: sign(ts, body) }).ok).toBe(false);
    expect(verifyMod.verifySlackRequest({ secret: SIGNING, rawBody: body, timestamp: ts, signature: 'v0=short' })).toEqual({ ok: false, reason: 'bad_signature' });
    expect(verifyMod.verifySlackRequest({ secret: SIGNING, rawBody: body, timestamp: ts, signature: null })).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('enforces the 5-minute replay window in both directions', () => {
    const now = 1_800_000_000;
    const body = 'x';
    const at = (t: number) => verifyMod.verifySlackRequest({ secret: SIGNING, rawBody: body, timestamp: String(t), signature: sign(String(t), body), nowSeconds: now });
    expect(at(now - 300).ok).toBe(true);
    expect(at(now + 300).ok).toBe(true);
    expect(at(now - 301)).toEqual({ ok: false, reason: 'stale' });
    expect(at(now + 301)).toEqual({ ok: false, reason: 'stale' });
  });

  it('fails closed without a secret or with a junk timestamp', () => {
    const ts = nowTs();
    expect(verifyMod.verifySlackRequest({ secret: '', rawBody: 'x', timestamp: ts, signature: sign(ts, 'x') })).toEqual({ ok: false, reason: 'no_secret' });
    for (const bad of ['', 'abc', '12.5', '-1', null]) {
      expect(verifyMod.verifySlackRequest({ secret: SIGNING, rawBody: 'x', timestamp: bad as any, signature: 'v0=' })).toEqual({ ok: false, reason: 'bad_timestamp' });
    }
  });
});

describe('OAuth state (unit)', () => {
  const p = { workspaceId: '00000000-0000-4000-8000-000000000001', userId: '00000000-0000-4000-8000-000000000002' };
  it('round-trips with the matching browser nonce', () => {
    const { state, nonce } = stateMod.signState(CLIENT_SECRET, p);
    const r = stateMod.verifyState(CLIENT_SECRET, state, nonce);
    expect(r.ok && r.payload.w === p.workspaceId && r.payload.u === p.userId).toBe(true);
  });
  it('rejects a tampered payload, tampered MAC, other key, expired state, missing/mismatched nonce', () => {
    const now = 1_800_000_000;
    const { state, nonce } = stateMod.signState(CLIENT_SECRET, { ...p, nowSeconds: now });
    const [body, mac] = state.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), w: 'evil' })).toString('base64url');
    expect(stateMod.verifyState(CLIENT_SECRET, `${forged}.${mac}`, nonce, now)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(stateMod.verifyState(CLIENT_SECRET, `${body}.${mac.slice(0, -2)}AA`, nonce, now)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(stateMod.verifyState('a-different-client-secret', state, nonce, now)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(stateMod.verifyState(CLIENT_SECRET, state, nonce, now + stateMod.STATE_TTL_SECONDS + 1)).toEqual({ ok: false, reason: 'expired' });
    expect(stateMod.verifyState(CLIENT_SECRET, state, nonce, now + stateMod.STATE_TTL_SECONDS).ok).toBe(true);
    expect(stateMod.verifyState(CLIENT_SECRET, state, undefined, now)).toEqual({ ok: false, reason: 'nonce_mismatch' });
    expect(stateMod.verifyState(CLIENT_SECRET, state, 'other-browser', now)).toEqual({ ok: false, reason: 'nonce_mismatch' });
    expect(stateMod.verifyState(CLIENT_SECRET, 'garbage', nonce, now)).toEqual({ ok: false, reason: 'malformed' });
    expect(stateMod.verifyState(CLIENT_SECRET, 'a.b.c', nonce, now)).toEqual({ ok: false, reason: 'malformed' });
    expect(stateMod.verifyState('', state, nonce, now)).toEqual({ ok: false, reason: 'not_configured' });
    expect(() => stateMod.signState('', p)).toThrow();
  });
});

describe('bot token encryption round trip (unit)', () => {
  it('round-trips, uses a fresh IV each time, and binds to workspace + team', () => {
    const tok = 'xoxb-SAMPLE-123-abc';
    const a = cryptoMod.encryptBotToken(tok, 'ws1', 'T1');
    const b = cryptoMod.encryptBotToken(tok, 'ws1', 'T1');
    expect(a).not.toBe(b);
    expect(a).not.toContain(tok);
    expect(a).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
    expect(cryptoMod.decryptBotToken(a, 'ws1', 'T1')).toBe(tok);
    expect(() => cryptoMod.decryptBotToken(a, 'ws2', 'T1')).toThrow();
    expect(() => cryptoMod.decryptBotToken(a, 'ws1', 'T2')).toThrow();
    const parts = a.split(':');
    const flipped = Buffer.from(parts[3], 'base64'); flipped[0] ^= 1;
    expect(() => cryptoMod.decryptBotToken([parts[0], parts[1], parts[2], flipped.toString('base64')].join(':'), 'ws1', 'T1')).toThrow();
  });
  it('fails closed without a key and refuses non-bot tokens', () => {
    expect(() => cryptoMod.encryptBotToken('xoxp-user-token', 'ws1', 'T1')).toThrow();
    const saved = process.env.BUREAU_ACTIVITY_ENCRYPTION_KEY;
    try {
      delete process.env.BUREAU_ACTIVITY_ENCRYPTION_KEY;
      expect(() => cryptoMod.encryptBotToken('xoxb-SAMPLE-1', 'ws1', 'T1')).toThrow(/not set/);
      process.env.BUREAU_ACTIVITY_ENCRYPTION_KEY = 'too-short';
      expect(() => cryptoMod.encryptBotToken('xoxb-SAMPLE-1', 'ws1', 'T1')).toThrow(/32 bytes/);
    } finally { process.env.BUREAU_ACTIVITY_ENCRYPTION_KEY = saved; }
  });
});

describe('event routing + command parsing (unit)', () => {
  const base = { type: 'event_callback', team_id: 'TSAMPLE', event_id: 'Ev1' };
  it('routes events', () => {
    expect(eventsMod.routeEvent({ type: 'url_verification', challenge: 'c1' })).toEqual({ action: 'url_verification', challenge: 'c1' });
    expect(eventsMod.routeEvent({ ...base, event: { type: 'app_mention', user: 'U1', text: '<@UB> hi', channel: 'C1', ts: '1.1' } }))
      .toMatchObject({ action: 'command', surface: 'mention', user: 'U1', channel: 'C1', threadTs: null });
    expect(eventsMod.routeEvent({ ...base, event: { type: 'app_mention', user: 'U1', text: 'x', channel: 'C1', ts: '1.2', thread_ts: '1.0' } }))
      .toMatchObject({ threadTs: '1.0' });
    expect(eventsMod.routeEvent({ ...base, event: { type: 'message', channel_type: 'im', user: 'U1', text: 'status', channel: 'D1', ts: '1.1' } }))
      .toMatchObject({ action: 'command', surface: 'dm' });
    expect(eventsMod.routeEvent({ ...base, event: { type: 'message', channel_type: 'channel', user: 'U1', text: 'x', channel: 'C1', ts: '1.1' } }).action).toBe('ignore');
    expect(eventsMod.routeEvent({ ...base, event: { type: 'message', channel_type: 'im', bot_id: 'B1', user: 'U1', text: 'x', channel: 'D1', ts: '1' } }).action).toBe('ignore');
    expect(eventsMod.routeEvent({ ...base, event: { type: 'message', channel_type: 'im', subtype: 'message_changed', channel: 'D1', ts: '1' } }).action).toBe('ignore');
    expect(eventsMod.routeEvent({ ...base, event: { type: 'app_uninstalled' } })).toEqual({ action: 'uninstalled', teamId: 'TSAMPLE', eventId: 'Ev1' });
    expect(eventsMod.routeEvent({ ...base, event: { type: 'tokens_revoked', tokens: { bot: ['UB'], oauth: ['U9'] } } }))
      .toEqual({ action: 'tokens_revoked', teamId: 'TSAMPLE', eventId: 'Ev1', botUserIds: ['UB'] });
    expect(eventsMod.routeEvent({ type: 'event_callback', event: { type: 'app_mention' } }).action).toBe('ignore');
    expect(eventsMod.routeEvent({ type: 'app_rate_limited' }).action).toBe('ignore');
    expect(eventsMod.routeEvent(null).action).toBe('ignore');
  });

  it('parses the deterministic grammar', () => {
    const p = commandsMod.parseCommand;
    expect(p('')).toEqual({ kind: 'help' });
    expect(p('help')).toEqual({ kind: 'help' });
    expect(p('status')).toEqual({ kind: 'status', who: null });
    expect(p('status jack')).toEqual({ kind: 'status', who: 'jack' });
    expect(p("what's jack working on?")).toEqual({ kind: 'status', who: 'jack' });
    expect(p('what is Jack Qiao working on')).toEqual({ kind: 'status', who: 'Jack Qiao' });
    expect(p('ask jack is the release on track?')).toEqual({ kind: 'ask', who: 'jack', question: 'is the release on track?' });
    expect(p('ask <@U123|jack> eta?')).toEqual({ kind: 'ask', who: '<@U123|jack>', question: 'eta?' });
    expect(p('@jack eta?')).toEqual({ kind: 'ask', who: '@jack', question: 'eta?' });
    expect(p('ask jack')).toEqual({ kind: 'usage', command: 'ask' });
    expect(p('questions')).toEqual({ kind: 'questions', who: null });
    expect(p('questions jack')).toEqual({ kind: 'questions', who: 'jack' });
    expect(p('answer 1a2b3c4d yes, Friday')).toEqual({ kind: 'answer', ref: '1a2b3c4d', text: 'yes, Friday' });
    expect(p("answer 1a2b' x")).toEqual({ kind: 'usage', command: 'answer' });
    expect(p('board')).toEqual({ kind: 'board', days: 7 });
    expect(p('team board 14')).toEqual({ kind: 'board', days: 14 });
    expect(p('board 99')).toEqual({ kind: 'board', days: 30 });
    expect(p('digest')).toEqual({ kind: 'digest', period: 'daily', who: null });
    expect(p('digest weekly jack')).toEqual({ kind: 'digest', period: 'weekly', who: 'jack' });
    expect(p('tell me a joke')).toEqual({ kind: 'unknown', text: 'tell me a joke' });
  });

  it('cleans Slack markup and strips only the bot mention', () => {
    expect(eventsMod.commandText('<@UB> ask <@U2|kim> see <https://x.test/a|this> &amp; <mailto:a@b.c|a@b.c>', 'UB'))
      .toBe('ask <@U2|kim> see https://x.test/a & a@b.c');
    expect(eventsMod.commandText('<@UB> status', null)).toBe('status');
    expect(commandsMod.mentionedUserId('<@U2|kim>')).toBe('U2');
    expect(commandsMod.mentionedUserId('kim')).toBeNull();
  });

  it('only posts to hooks.slack.com response URLs', () => {
    expect(apiMod.isSlackResponseUrl('https://hooks.slack.com/commands/T1/2/abc')).toBe(true);
    for (const bad of ['http://hooks.slack.com/x', 'https://evil.test/x', 'https://hooks.slack.com.evil.test/x', 'https://u:p@hooks.slack.com/x', 'https://hooks.slack.com:8443/x', 'nope']) {
      expect(apiMod.isSlackResponseUrl(bad)).toBe(false);
    }
  });

  it('manifest matches the code: prod URLs, scopes, events, slash command', () => {
    const m = JSON.parse(readFileSync('slack-app-manifest.json', 'utf8'));
    const prod = configMod.PROD_APP_URL;
    expect(prod).toBe('https://bureau-krustbuild.vercel.app');
    expect(m.oauth_config.scopes.bot.sort()).toEqual([...configMod.SLACK_BOT_SCOPES].sort());
    expect(m.oauth_config.redirect_urls).toEqual([`${prod}/api/slack/oauth/callback`]);
    expect(m.settings.event_subscriptions.request_url).toBe(`${prod}/api/slack/events`);
    expect(m.settings.event_subscriptions.bot_events.sort()).toEqual(['app_mention', 'app_uninstalled', 'message.im', 'tokens_revoked']);
    expect(m.features.slash_commands).toEqual([expect.objectContaining({ command: '/bureau', url: `${prod}/api/slack/commands`, should_escape: true })]);
    expect(m.oauth_config.scopes.bot).not.toContain('channels:history');
    expect(m.oauth_config.scopes.bot).not.toContain('chat:write.public');
    expect(m.settings.token_rotation_enabled).toBe(false);
    expect(m.settings.org_deploy_enabled).toBe(false);
  });
});

// ===========================================================================
describe('Add to Slack OAuth install', () => {
  it('start: members are sent back; owners are redirected to Slack with signed state + nonce cookie', async () => {
    const member = await asUser(installGet, jack, 'https://bureau.sample.invalid/api/slack/install');
    expect(member.status).toBe(303);
    expect(member.res.headers.get('location')).toContain('slack=owner_only');
    expect(await asUser(installGet, null, 'https://bureau.sample.invalid/api/slack/install').then(r => r.status)).toBe(401);

    const r = await asUser(installGet, ada, 'https://bureau.sample.invalid/api/slack/install');
    expect(r.status).toBe(303);
    const loc = new URL(r.res.headers.get('location'));
    expect(loc.origin + loc.pathname).toBe('https://slack.com/oauth/v2/authorize');
    expect(loc.searchParams.get('client_id')).toBe('SAMPLE.client.id');
    expect(loc.searchParams.get('scope')).toBe(configMod.SLACK_BOT_SCOPES.join(','));
    expect(loc.searchParams.get('redirect_uri')).toBe('https://bureau.sample.invalid/api/slack/oauth/callback');
    const setCookie = r.res.headers.get('set-cookie') || '';
    expect(setCookie).toMatch(/bureau_slack_oauth=/);
    expect(setCookie.toLowerCase()).toContain('httponly');
    expect(setCookie).not.toContain(CLIENT_SECRET);
    expect(r.res.headers.get('location')).not.toContain(CLIENT_SECRET);
  });

  it('start: not configured -> back to settings', async () => {
    const saved = process.env.SLACK_CLIENT_SECRET;
    delete process.env.SLACK_CLIENT_SECRET;
    try {
      const r = await asUser(installGet, ada, 'https://bureau.sample.invalid/api/slack/install');
      expect(r.res.headers.get('location')).toContain('slack=not_configured');
    } finally { process.env.SLACK_CLIENT_SECRET = saved; }
  });

  it('callback rejects bad state, a missing browser nonce, another user, and Slack errors; nothing is stored', async () => {
    const start = await asUser(installGet, ada, 'https://bureau.sample.invalid/api/slack/install');
    const state = new URL(start.res.headers.get('location')).searchParams.get('state')!;
    const nonce = /bureau_slack_oauth=([^;]+)/.exec(start.res.headers.get('set-cookie') || '')?.[1] || '';
    const cb = (user: Member | null, qs: string, cookie?: string) =>
      asUser(callbackGet, user, `https://bureau.sample.invalid/api/slack/oauth/callback?${qs}`, { cookie });
    slackHandlers['oauth.v2.access'] = () => { throw new Error('must not exchange the code'); };
    expect((await cb(ada, `code=x&state=${encodeURIComponent(state)}tampered`, `bureau_slack_oauth=${nonce}`)).res.headers.get('location')).toContain('slack=invalid_state');
    expect((await cb(ada, `code=x&state=${encodeURIComponent(state)}`)).res.headers.get('location')).toContain('slack=invalid_state');
    expect((await cb(jack, `code=x&state=${encodeURIComponent(state)}`, `bureau_slack_oauth=${nonce}`)).res.headers.get('location')).toContain('slack=invalid_state');
    expect((await cb(null, `code=x&state=${encodeURIComponent(state)}`, `bureau_slack_oauth=${nonce}`)).res.headers.get('location')).toContain('slack=invalid_state');
    expect((await cb(ada, 'error=access_denied')).res.headers.get('location')).toContain('slack=denied');
    expect(callsOf('oauth.v2.access').length).toBe(0);

    slackHandlers['oauth.v2.access'] = () => ({ ok: false, error: 'invalid_code' });
    expect((await cb(ada, `code=x&state=${encodeURIComponent(state)}`, `bureau_slack_oauth=${nonce}`)).res.headers.get('location')).toContain('slack=error');
    slackHandlers['oauth.v2.access'] = () => ({ ok: true, token_type: 'user', access_token: 'xoxp-SAMPLE', team: { id: team } });
    expect((await cb(ada, `code=x&state=${encodeURIComponent(state)}`, `bureau_slack_oauth=${nonce}`)).res.headers.get('location')).toContain('slack=error');
    expect(await q(`SELECT * FROM bureau.slack_installations WHERE team_id = $1`, [team])).toEqual([]);
  });

  it('valid install stores an encrypted token (never exposed) and links members by email', async () => {
    const { cb } = await installAs(ada, W.id, team);
    expect(cb.status).toBe(303);
    const loc = cb.res.headers.get('location');
    expect(loc).toContain('/settings/team?slack=connected');
    expect(loc).not.toContain(BOT_TOKEN);
    expect(cb.text).not.toContain(BOT_TOKEN);
    const ex = callsOf('oauth.v2.access')[0];
    expect(ex.body).toEqual({ code: 'SAMPLE-code', redirect_uri: 'https://bureau.sample.invalid/api/slack/oauth/callback' });
    expect(ex.auth).toBe(`Basic ${Buffer.from(`SAMPLE.client.id:${CLIENT_SECRET}`).toString('base64')}`);

    const [inst] = await q(`SELECT * FROM bureau.slack_installations WHERE team_id = $1`, [team]);
    expect(inst).toMatchObject({ workspace_id: W.id, status: 'active', bot_user_id: BOT, team_name: 'SAMPLE Highstreet', installed_by: ada.userId });
    expect(JSON.stringify(inst)).not.toContain(BOT_TOKEN);
    const [tok] = await q(`SELECT * FROM bureau.slack_bot_tokens WHERE team_id = $1`, [team]);
    expect(tok.encrypted_bot_token).not.toContain(BOT_TOKEN);
    expect(cryptoMod.decryptBotToken(tok.encrypted_bot_token, W.id, team)).toBe(BOT_TOKEN);

    // users.list ran after the redirect: ada (upper-case email) + jack linked; stranger seen; external + bot skipped
    const links = await q(`SELECT slack_user_id, member_user_id, linked_how FROM bureau.slack_user_links WHERE workspace_id = $1 ORDER BY slack_user_id`, [W.id]);
    expect(links).toEqual([
      { slack_user_id: SL.ada, member_user_id: ada.userId, linked_how: 'email' },
      { slack_user_id: SL.jack, member_user_id: jack.userId, linked_how: 'email' },
      { slack_user_id: SL.stranger, member_user_id: null, linked_how: null },
    ]);
  });

  it('another Bureau workspace cannot take over the same Slack team', async () => {
    const { cb } = await installAs(W2.owner, W2.id, team);
    expect(cb.res.headers.get('location')).toContain('slack=team_taken');
    const [inst] = await q(`SELECT workspace_id FROM bureau.slack_installations WHERE team_id = $1`, [team]);
    expect(inst.workspace_id).toBe(W.id);
    const [tok] = await q(`SELECT workspace_id FROM bureau.slack_bot_tokens WHERE team_id = $1`, [team]);
    expect(tok.workspace_id).toBe(W.id);
  });

  it('status API shows the connection without any token material', async () => {
    const r = await asUser(statusGet, ada, 'https://bureau.sample.invalid/api/slack/status');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ configured: true, can_manage: true, is_leader: true, installation: { team_id: team, status: 'active' }, me: { slack_user_id: SL.ada } });
    expect(r.text).not.toContain(BOT_TOKEN);
    expect(r.text).not.toMatch(/encrypted|v1:/);
    const m = await asUser(statusGet, jack, 'https://bureau.sample.invalid/api/slack/status');
    expect(m.body).toMatchObject({ can_manage: false, is_leader: false, links: [], members: [] });
  });
});

// ===========================================================================
describe('Events API: reactive @Bureau and DMs', () => {
  it('rejects bad signatures and stale requests without storing anything', async () => {
    const p = mention(SL.ada, 'status');
    expect((await postEvent(p, { sig: 'v0=' + '0'.repeat(64) })).status).toBe(401);
    expect((await postEvent(p, { ts: String(Math.floor(Date.now() / 1000) - 301) })).status).toBe(401);
    expect((await postEvent(p, { ts: 'abc' })).status).toBe(401);
    expect(await q(`SELECT 1 FROM bureau.slack_event_ids WHERE event_id = $1`, [p.event_id])).toEqual([]);
    expect(calls.length).toBe(0);
  });

  it('url_verification echoes the challenge', async () => {
    expect((await postEvent({ type: 'url_verification', challenge: 'chal-SAMPLE' })).body).toEqual({ challenge: 'chal-SAMPLE' });
  });

  it('@Bureau ask jack ... -> 200 ack, a Slack question, a threaded Block Kit reply from his check-in, and an encrypted activity log', async () => {
    const p = mention(SL.ada, 'ask jack is the onboarding release on track?');
    const r = await postEvent(p);
    expect(r).toEqual({ status: 200, body: { ok: true } });
    const qs = await slackQuestions(jackClone);
    expect(qs.length).toBe(1);
    expect(qs[0]).toMatchObject({ question_text: 'is the onboarding release on track?', asker_user_id: ada.userId, asker_slack_user_id: SL.ada, status: 'open' });
    const posts = callsOf('chat.postMessage');
    expect(posts.length).toBe(1);
    expect(posts[0].auth).toBe(`Bearer ${BOT_TOKEN}`);
    expect(posts[0].body).toMatchObject({ channel: 'CSAMPLE1', thread_ts: p.event.ts });
    expect(posts[0].body.text).toContain('SAMPLE: ship the onboarding flow');
    expect(JSON.stringify(posts[0].body.blocks)).toContain('SAMPLE waiting on legal');
    expect(JSON.stringify(posts[0].body.blocks)).toContain('https://bureau.sample.invalid/questions');

    const logs = await slackLogs(ada);
    expect(logs.length).toBe(1);
    expect(logs[0]).toMatchObject({ workspace_id: W.id, source: 'slack', vendor: 'slack', agent_label: 'Slack @Bureau', kind: 'request' });
    expect(logs[0].conversation_ref).toBe(`slack:${team}:CSAMPLE1:${p.event.ts}`);
    expect(logs[0].request_enc).not.toContain('onboarding');
    const { decryptActivity } = await import('../lib/activity-crypto');
    expect(decryptActivity(logs[0].request_enc, W.id, ada.userId)).toBe('ask jack is the onboarding release on track?');
  });

  it('duplicate event_id is processed once; a Slack retry with a new delivery is processed, not dropped', async () => {
    const p = mention(SL.ada, 'ask jack dedupe check');
    await postEvent(p);
    const before = (await slackQuestions(jackClone)).length;
    const again = await postEvent(p, { retry: '1' });
    expect(again).toEqual({ status: 200, body: { ok: true, duplicate: true } });
    expect((await slackQuestions(jackClone)).length).toBe(before);

    // First attempt never reached us (e.g. timed out upstream): the retry must be handled.
    const r = await postEvent(mention(SL.ada, 'ask jack retry check'), { retry: '2' });
    expect(r.status).toBe(200);
    expect((await slackQuestions(jackClone)).length).toBe(before + 1);
  });

  it('DM "status jack" replies in the DM (no thread) with his check-in', async () => {
    await postEvent(dm(SL.ada, "what's jack working on?"));
    const posts = callsOf('chat.postMessage');
    expect(posts.length).toBe(1);
    expect(posts[0].body.channel).toBe('DSAMPLE1');
    expect(posts[0].body.thread_ts).toBeUndefined();
    expect(posts[0].body.text).toContain('SAMPLE: ship the onboarding flow');
    expect((await slackLogs(ada)).at(-1)).toMatchObject({ agent_label: 'Slack DM to Bureau' });
  });

  it('team status lists the workspace only (never another workspace)', async () => {
    await postEvent(mention(SL.ada, 'status'));
    const body = JSON.stringify(callsOf('chat.postMessage')[0].body);
    expect(body).toContain('Jack (SAMPLE)');
    expect(body).not.toContain('Zed');
  });

  it('cannot reach a clone in another Bureau workspace; unknown Slack team does nothing', async () => {
    await postEvent(mention(SL.ada, `ask ${w2Handle} leak?`));
    expect(await slackQuestions(w2Clone)).toEqual([]);
    const eph = callsOf('chat.postEphemeral');
    expect(eph.length).toBe(1);
    expect(eph[0].body).toMatchObject({ user: SL.ada, channel: 'CSAMPLE1' });
    expect(eph[0].body.text).toMatch(/No one called/);

    calls.length = 0;
    await postEvent(mention(SL.ada, 'status', `T${uid().toUpperCase()}`));
    expect(calls.length).toBe(0);
  });

  it('a Slack user with no Bureau account gets a private "who are you" and nothing is recorded', async () => {
    const before = (await q(`SELECT count(*)::int n FROM bureau.questions WHERE source = 'slack'`))[0].n;
    await postEvent(mention(SL.stranger, 'ask jack hello'));
    expect(callsOf('chat.postMessage').length).toBe(0);
    const eph = callsOf('chat.postEphemeral');
    expect(eph.length).toBe(1);
    expect(eph[0].body.text).toMatch(/don't know who you are/);
    expect((await q(`SELECT count(*)::int n FROM bureau.questions WHERE source = 'slack'`))[0].n).toBe(before);
  });

  it('a user from another Slack org with a matching email is not linked', async () => {
    await postEvent(mention(SL.ext, 'ask jack hello'));
    expect(callsOf('chat.postEphemeral')[0].body.text).toMatch(/don't know who you are/);
    expect(await q(`SELECT * FROM bureau.slack_user_links WHERE slack_user_id = $1`, [SL.ext])).toEqual([]);
  });

  it('links a new Slack user by email on first contact (users.info), then answers', async () => {
    expect(await q(`SELECT * FROM bureau.slack_user_links WHERE slack_user_id = $1`, [SL.kim])).toEqual([]);
    await postEvent(mention(SL.kim, 'ask <@UJACKSAMPLE> can you review my PR?'));
    expect(callsOf('users.info').length).toBe(1);
    const [link] = await q(`SELECT member_user_id, linked_how FROM bureau.slack_user_links WHERE slack_user_id = $1`, [SL.kim]);
    expect(link).toEqual({ member_user_id: kim.userId, linked_how: 'email' });
    const qs = await slackQuestions(jackClone);
    expect(qs.at(-1)).toMatchObject({ question_text: 'can you review my PR?', asker_user_id: kim.userId });
    calls.length = 0;
    await postEvent(mention(SL.kim, 'status jack'));
    expect(callsOf('users.info').length).toBe(0); // cached link
  });

  it('no activity is logged without an accepted notice (and the reply says so)', async () => {
    await postEvent(mention(SL.lee, 'status jack'));
    expect(await slackLogs(lee)).toEqual([]);
    const post = callsOf('chat.postMessage')[0];
    expect(JSON.stringify(post.body.blocks)).toContain('Not logged');
  });

  it('board/digest: owners get a private (ephemeral) reply; members are refused', async () => {
    await postEvent(mention(SL.jack, 'board'));
    expect(callsOf('chat.postMessage').length).toBe(0);
    expect(callsOf('chat.postEphemeral')[0].body.text).toMatch(/only for Bureau owners and admins/);

    calls.length = 0;
    await postEvent(mention(SL.ada, 'digest weekly'));
    expect(callsOf('chat.postMessage').length).toBe(0);
    const eph = callsOf('chat.postEphemeral');
    expect(eph.length).toBe(1);
    expect(eph[0].body.user).toBe(SL.ada);
    expect(eph[0].body.text).toMatch(/Weekly digest/);
  });

  it('jack lists and answers his open questions from a DM', async () => {
    await postEvent(dm(SL.jack, 'questions'));
    const listing = JSON.stringify(callsOf('chat.postMessage')[0].body.blocks);
    const open = await q(`SELECT id::text FROM bureau.questions WHERE target_clone_id = $1 AND status = 'open' ORDER BY asked_at DESC LIMIT 1`, [jackClone]);
    expect(listing).toContain(open[0].id.slice(0, 8));

    calls.length = 0;
    await postEvent(dm(SL.jack, `answer ${open[0].id.slice(0, 8)} Yes, shipping Friday (SAMPLE)`));
    const [row] = await q(`SELECT status::text, answer_text, answered_by_clone FROM bureau.questions WHERE id = $1`, [open[0].id]);
    expect(row).toEqual({ status: 'answered', answer_text: 'Yes, shipping Friday (SAMPLE)', answered_by_clone: false });
    expect(callsOf('chat.postMessage')[0].body.text).toBe('Answered.');

    // ada cannot answer a question asked of jack's AI
    const other = await q(`SELECT id::text FROM bureau.questions WHERE target_clone_id = $1 AND status = 'open' LIMIT 1`, [jackClone]);
    if (other[0]) {
      calls.length = 0;
      await postEvent(dm(SL.ada, `answer ${other[0].id.slice(0, 8)} hijack`));
      const [still] = await q(`SELECT status::text FROM bureau.questions WHERE id = $1`, [other[0].id]);
      expect(still.status).toBe('open');
    }
  });

  it('ignores our own bot and other bots', async () => {
    await postEvent(mention(BOT, 'status'));
    await postEvent({ ...dm(SL.ada, 'status'), event: { ...dm(SL.ada, 'status').event, bot_id: 'B1' } });
    expect(calls.length).toBe(0);
  });
});

// ===========================================================================
describe('/bureau slash command', () => {
  const slash = (text: string, extra: Record<string, string> = {}) => ({
    command: '/bureau', text, team_id: team, user_id: SL.ada, channel_id: 'CSAMPLE2',
    response_url: 'https://hooks.slack.com/commands/TSAMPLE/1/SAMPLE', trigger_id: `trig.${uid()}`, ...extra,
  });

  it('verifies the signature on the form-encoded body', async () => {
    expect((await postSlash(slash('status'), { sig: 'v0=' + 'f'.repeat(64) })).status).toBe(401);
    expect((await postSlash(slash('status'), { ts: String(Math.floor(Date.now() / 1000) - 400) })).status).toBe(401);
    expect(calls.length).toBe(0);
  });

  it('acks within the request with an ephemeral message, then answers via response_url', async () => {
    const r = await postSlash(slash('status jack'));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ response_type: 'ephemeral', text: 'Looking that up in Bureau\u2026' });
    const sent = callsOf('response_url');
    expect(sent.length).toBe(1);
    expect(sent[0].url).toBe('https://hooks.slack.com/commands/TSAMPLE/1/SAMPLE');
    expect(sent[0].body).toMatchObject({ response_type: 'ephemeral', replace_original: true });
    expect(sent[0].body.text).toContain('SAMPLE: ship the onboarding flow');
    expect((await slackLogs(ada)).at(-1)).toMatchObject({ agent_label: 'Slack /bureau' });
  });

  it('help is answered inline; a non-Slack response_url is refused', async () => {
    const h = await postSlash(slash('help'));
    expect(h.body.response_type).toBe('ephemeral');
    expect(JSON.stringify(h.body.blocks)).toContain('digest');
    const bad = await postSlash(slash('status', { response_url: 'https://evil.sample.invalid/hook' }));
    expect(bad.body.text).toMatch(/could not read/);
    expect(calls.length).toBe(0);
  });

  it('ask from /bureau creates a Slack question', async () => {
    const before = (await slackQuestions(jackClone)).length;
    await postSlash(slash('ask jack SAMPLE slash question'));
    expect((await slackQuestions(jackClone)).length).toBe(before + 1);
  });
});

// ===========================================================================
describe('members sync + manual link (owners/admins)', () => {
  it('members cannot refresh or link; owners can manually link an unmatched Slack user', async () => {
    expect((await asUser(membersPost, jack, 'https://bureau.sample.invalid/api/slack/members', { method: 'POST' })).status).toBe(403);
    expect((await asUser(membersPut, jack, 'https://bureau.sample.invalid/api/slack/members', { method: 'PUT', body: { slack_user_id: SL.stranger, member_user_id: jack.userId } })).status).toBe(403);
    const sync = await asUser(membersPost, ada, 'https://bureau.sample.invalid/api/slack/members', { method: 'POST' });
    expect(sync.body).toMatchObject({ ok: true, seen: 3, linked: 2, unlinked: 1 });
    const bad = await asUser(membersPut, ada, 'https://bureau.sample.invalid/api/slack/members', { method: 'PUT', body: { slack_user_id: SL.stranger, member_user_id: W2.owner.userId } });
    expect(bad.status).toBe(400);
    const ok = await asUser(membersPut, ada, 'https://bureau.sample.invalid/api/slack/members', { method: 'PUT', body: { slack_user_id: SL.stranger, member_user_id: lee.userId } });
    expect(ok.status).toBe(200);
    expect((await q(`SELECT member_user_id, linked_how, linked_by FROM bureau.slack_user_links WHERE slack_user_id = $1`, [SL.stranger]))[0])
      .toEqual({ member_user_id: lee.userId, linked_how: 'manual', linked_by: ada.userId });
    // a later email sync never overwrites a manual link
    await asUser(membersPost, ada, 'https://bureau.sample.invalid/api/slack/members', { method: 'POST' });
    expect((await q(`SELECT linked_how FROM bureau.slack_user_links WHERE slack_user_id = $1`, [SL.stranger]))[0].linked_how).toBe('manual');
  });
});

// ===========================================================================
describe('database guards (migration 20261127000000_slack_connect)', () => {
  it('bureau_app: no auth usage, no role membership, no oauth secret grants, no access to slack_bot_tokens', async () => {
    const [g] = await q(`SELECT has_schema_privilege('bureau_app','auth','USAGE') AS auth_usage,
      (SELECT count(*)::int FROM pg_auth_members WHERE member = 'bureau_app'::regrole) AS memberships,
      (SELECT count(*)::int FROM information_schema.role_table_grants WHERE grantee='bureau_app'
         AND table_schema='bureau' AND table_name IN ('oauth_tokens','oauth_codes','oauth_device_codes','slack_bot_tokens')) AS secret_grants`);
    expect(g).toEqual({ auth_usage: false, memberships: 0, secret_grants: 0 });
    const app = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      await expect(app.query('SELECT * FROM bureau.slack_bot_tokens')).rejects.toThrow(/permission denied/);
    } finally { await app.end(); }
  });

  it('RLS is on for the new tables; definer functions pin search_path and are bureau_app-only', async () => {
    const rls = await q(`SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'bureau'::regnamespace AND relname IN ('slack_bot_tokens','slack_user_links') ORDER BY 1`);
    expect(rls).toEqual([{ relname: 'slack_bot_tokens', relrowsecurity: true }, { relname: 'slack_user_links', relrowsecurity: true }]);
    const fns = await q(`SELECT p.proname, p.prosecdef, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authd,
        has_function_privilege('bureau_app', p.oid, 'EXECUTE') AS app, array_to_string(p.proconfig, ';') AS cfg
      FROM pg_proc p WHERE p.pronamespace = 'bureau'::regnamespace AND p.proname IN
        ('slack_store_installation','slack_get_installation','slack_mark_uninstalled','slack_resolve_user','slack_link_user_by_email') ORDER BY 1`);
    expect(fns.length).toBe(5);
    for (const f of fns) expect(f).toMatchObject({ prosecdef: true, anon: false, authd: false, app: true, cfg: 'search_path=bureau, pg_temp' });
  });

  it('slack_store_installation refuses non-owners even when called directly', async () => {
    const { withUser } = await import('../lib/db');
    const out = await withUser(jack.userId, jack.email, async (c: any) => (await c.query(
      `SELECT bureau.slack_store_installation($1, $2, 'x', NULL, NULL, NULL, NULL, 'v1:AA==:AA==:AA==') AS o`, [W.id, `T${uid().toUpperCase()}`]
    )).rows[0].o);
    expect(out).toBe('forbidden');
  });

  it('members can read links in their workspace but not write them; other workspaces see nothing', async () => {
    const { withUser } = await import('../lib/db');
    const seen = await withUser(jack.userId, jack.email, async (c: any) => (await c.query(`SELECT count(*)::int n FROM bureau.slack_user_links`)).rows[0].n);
    expect(seen).toBeGreaterThan(0);
    const upd = await withUser(jack.userId, jack.email, async (c: any) => (await c.query(`UPDATE bureau.slack_user_links SET member_user_id = $1, linked_how = 'manual' WHERE workspace_id = $2`, [jack.userId, W.id])).rowCount);
    expect(upd).toBe(0);
    const other = await withUser(W2.owner.userId, W2.owner.email, async (c: any) => (await c.query(`SELECT count(*)::int n FROM bureau.slack_user_links`)).rows[0].n);
    expect(other).toBe(0);
  });
});

// ===========================================================================
describe('disconnect, tokens_revoked and app_uninstalled', () => {
  it('tokens_revoked for our bot destroys the token and stops replies', async () => {
    await postEvent({ type: 'event_callback', team_id: team, event_id: `Ev${uid().toUpperCase()}`, event: { type: 'tokens_revoked', tokens: { bot: ['USOMEONEELSE'] } } });
    expect((await q(`SELECT status FROM bureau.slack_installations WHERE team_id = $1`, [team]))[0].status).toBe('active');
    await postEvent({ type: 'event_callback', team_id: team, event_id: `Ev${uid().toUpperCase()}`, event: { type: 'tokens_revoked', tokens: { bot: [BOT] } } });
    expect((await q(`SELECT status FROM bureau.slack_installations WHERE team_id = $1`, [team]))[0].status).toBe('revoked');
    expect(await q(`SELECT 1 FROM bureau.slack_bot_tokens WHERE team_id = $1`, [team])).toEqual([]);
    calls.length = 0;
    await postEvent(mention(SL.ada, 'status'));
    expect(calls.length).toBe(0);
    const s = await postSlash({ command: '/bureau', text: 'status', team_id: team, user_id: SL.ada, channel_id: 'C1', response_url: 'https://hooks.slack.com/commands/T/1/x', trigger_id: 't' });
    expect(s.status).toBe(200);
    expect(callsOf('response_url')[0].body.text).toMatch(/not connected/);
  });

  it('reinstall, then Disconnect (owner) revokes at Slack and wipes the token; members cannot disconnect', async () => {
    const { cb } = await installAs(ada, W.id, team);
    expect(cb.res.headers.get('location')).toContain('slack=connected');
    expect((await asUser(installDelete, jack, 'https://bureau.sample.invalid/api/slack/install', { method: 'DELETE' })).status).toBe(403);
    calls.length = 0;
    const r = await asUser(installDelete, ada, 'https://bureau.sample.invalid/api/slack/install', { method: 'DELETE' });
    expect(r.body).toEqual({ ok: true, disconnected: true });
    expect(callsOf('auth.revoke')[0].auth).toBe(`Bearer ${BOT_TOKEN}`);
    expect((await q(`SELECT status FROM bureau.slack_installations WHERE team_id = $1`, [team]))[0].status).toBe('uninstalled');
    expect(await q(`SELECT 1 FROM bureau.slack_bot_tokens WHERE team_id = $1`, [team])).toEqual([]);
  });

  it('app_uninstalled marks the install uninstalled', async () => {
    await installAs(ada, W.id, team);
    await postEvent({ type: 'event_callback', team_id: team, event_id: `Ev${uid().toUpperCase()}`, event: { type: 'app_uninstalled' } });
    expect((await q(`SELECT status FROM bureau.slack_installations WHERE team_id = $1`, [team]))[0].status).toBe('uninstalled');
    expect(await q(`SELECT 1 FROM bureau.slack_bot_tokens WHERE team_id = $1`, [team])).toEqual([]);
  });

  it('a token that no longer decrypts (key rotated) fails closed: no replies', async () => {
    await installAs(ada, W.id, team);
    const saved = process.env.BUREAU_ACTIVITY_ENCRYPTION_KEY;
    process.env.BUREAU_ACTIVITY_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    try {
      calls.length = 0;
      await postEvent(mention(SL.ada, 'status'));
      expect(calls.length).toBe(0);
    } finally { process.env.BUREAU_ACTIVITY_ENCRYPTION_KEY = saved; }
  });
});
