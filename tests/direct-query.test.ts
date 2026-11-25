/**
 * Direct query (skip Slack): owners/admins read their team and ask a teammate's AI straight
 * from Bureau. Covers role-aware scopes (consent + device, no migration), /api/oauth/me role,
 * clone lookup (disambiguation, cross-workspace isolation, wildcard safety),
 * MCP bureau_ask_question / team_health who / get_questions who, POST /api/questions preview,
 * and the Top Floor / Ask-your-team render. App code runs as bureau_app; seeding uses admin.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import {
  admin, q, cleanup, createWorkspace, createUser, addMember, createClient, createOAuthToken,
  ALL_SCOPES, type Member, type Workspace,
} from './helpers/clone-fixtures';

let sessionUser: { id: string; email: string } | null = null;
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, delete: () => undefined }) }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: sessionUser } }) } }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  redirect: () => { throw new Error('redirect'); },
}));
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
vi.stubGlobal('fetch', async (url: any) => { throw new Error(`Unexpected network call in test: ${String(url)}`); });

const DEFAULT = ['ingest:write', 'clone:write', 'questions:read', 'questions:write'];

let mcpPost: any, mePost: any, authorizePost: any, tokenPost: any, devicePost: any, deviceApprovePost: any;
let questionsPost: any, questionsGet: any;
let oauth: typeof import('../lib/oauth-server');

// W1: Travis (owner), Ada (admin), Jack (member, "Jack's Claude"), Jill (member, two bots), Nova (member, no check-in)
let W1: Workspace, ada: Member, jack: Member, jill: Member, nova: Member;
// W2: another company that also has a "Jack's Claude" (same handle) -> must never resolve from W1
let W2: Workspace, jackOther: Member;
// W3: two different Jacks -> ambiguous
let W3: Workspace, jackA: Member, jackB: Member;
let jackClone: string, jillClaude: string, jillGrok: string, novaClone: string, otherJackClone: string, w3a: string, w3b: string;
let ownerTok: string, adaTok: string, jackTokAll: string, jackTokDefault: string, w3OwnerTok: string;

async function clone(ws: string, owner: Member, display: string, handle: string, seenMinsAgo = 5): Promise<string> {
  const [c] = await q<{ id: string }>(
    `INSERT INTO bureau.digital_clones (workspace_id, owner_user_id, display_name, handle, vendor, last_seen_at)
     VALUES ($1, $2, $3, $4, 'custom', NOW() - make_interval(mins => $5)) RETURNING id`,
    [ws, owner.userId, display, handle, seenMinsAgo]
  );
  return c.id;
}
async function heartbeat(cloneId: string, top: string, daysAgo = 0, extra: { active?: string[]; blocked?: string[] } = {}) {
  await q(
    `INSERT INTO bureau.clone_heartbeats (clone_id, date, top_priority, active, blocked)
     VALUES ($1, CURRENT_DATE - $2::int, $3, $4, $5)`,
    [cloneId, daysAgo, top, extra.active ?? [], extra.blocked ?? []]
  );
}

const mcp = async (token: string, name: string, args: any = {}) => {
  const res = await mcpPost(new NextRequest('http://localhost/api/mcp', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  }));
  const body = await res.json();
  return { status: res.status, body, data: body.result ? JSON.parse(body.result.content[0].text) : undefined };
};
const asJson = async (handler: any, user: Member | null, url: string, body?: any) => {
  sessionUser = user ? { id: user.userId, email: user.email } : null;
  try {
    const res = await handler(new NextRequest(url, body === undefined ? { method: 'GET' } : {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }));
    return { status: res.status, body: await res.json() };
  } finally { sessionUser = null; }
};
const token = async (form: Record<string, string>) => {
  const res = await tokenPost(new NextRequest('http://localhost/api/oauth/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString(),
  }));
  return { status: res.status, body: await res.json() };
};
const linkScopes = async (accessToken: string) => (await q<{ scopes: string[] }>(
  `SELECT al.scopes FROM bureau.oauth_tokens t JOIN bureau.agent_links al ON al.id = t.agent_link_id
   WHERE t.token_hash = encode(extensions.digest($1,'sha256'),'hex')`, [accessToken]))[0].scopes;
const questionCount = async (cloneId: string) =>
  (await q<{ n: number }>(`SELECT count(*)::int n FROM bureau.questions WHERE target_clone_id = $1`, [cloneId]))[0].n;

/** Consent through the real route (what /oauth/authorize posts), then the real token endpoint. */
async function consentConnect(user: Member, clientId: string, scopes: string[] | undefined, label: string) {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const c = await asJson(authorizePost, user, 'http://localhost/api/oauth/authorize', {
    client_id: clientId, redirect_uri: 'http://localhost/cb', state: 's', code_challenge: challenge,
    scopes, agent_label: label, stream_ids: [], allow_create_streams: true, approved: true,
  });
  expect(c.status).toBe(200);
  const t = await token({ grant_type: 'authorization_code', code: c.body.code, code_verifier: verifier, client_id: clientId, redirect_uri: 'http://localhost/cb' });
  expect(t.status).toBe(200);
  return t.body.access_token as string;
}
/** Device flow through the real routes: start (no user) -> approve as user -> poll. */
async function deviceConnect(user: Member, scope: string | undefined, label: string) {
  const start = await devicePost(new NextRequest('http://localhost/api/oauth/device', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(scope === undefined ? { client_name: 'CLI' } : { client_name: 'CLI', scope }),
  }));
  const d = await start.json();
  expect(start.status).toBe(200);
  const ap = await asJson(deviceApprovePost, user, 'http://localhost/api/oauth/device/approve',
    { user_code: d.user_code, agent_label: label, stream_ids: [], allow_create_streams: false });
  expect(ap.status).toBe(200);
  const t = await token({ grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: d.device_code });
  expect(t.status).toBe(200);
  return t.body.access_token as string;
}

beforeAll(async () => {
  ({ POST: mcpPost } = await import('../app/api/mcp/route'));
  ({ GET: mePost } = await import('../app/api/oauth/me/route'));
  ({ POST: authorizePost } = await import('../app/api/oauth/authorize/route'));
  ({ POST: tokenPost } = await import('../app/api/oauth/token/route'));
  ({ POST: devicePost } = await import('../app/api/oauth/device/route'));
  ({ POST: deviceApprovePost } = await import('../app/api/oauth/device/approve/route'));
  ({ POST: questionsPost, GET: questionsGet } = await import('../app/api/questions/route'));
  oauth = await import('../lib/oauth-server');

  W1 = await createWorkspace('dq1');
  ada = await createUser('ada'); await addMember(W1.id, ada, 'admin');
  jack = await createUser('jack'); await addMember(W1.id, jack, 'member');
  jill = await createUser('jill'); await addMember(W1.id, jill, 'member');
  nova = await createUser('nova'); await addMember(W1.id, nova, 'member');
  jackClone = await clone(W1.id, jack, "Jack's Claude", 'jack-claude');
  jillClaude = await clone(W1.id, jill, "Jill's Claude", 'jill-claude', 600);
  jillGrok = await clone(W1.id, jill, "Jill's Grok", 'jill-grok', 2);
  novaClone = await clone(W1.id, nova, "Nova's ChatGPT", 'nova-chatgpt');
  await heartbeat(jackClone, 'Ship the v2 release', 0, { active: ['release notes'], blocked: ['waiting on design review'] });
  await heartbeat(jackClone, 'Old priority', 3);
  await heartbeat(jillGrok, 'Hiring loop');

  W2 = await createWorkspace('dq2');
  jackOther = await createUser('jack'); await addMember(W2.id, jackOther, 'member');
  otherJackClone = await clone(W2.id, jackOther, "Jack's Claude", 'jack-claude');
  await heartbeat(otherJackClone, 'SECRET other-company plan');

  W3 = await createWorkspace('dq3');
  jackA = await createUser('jack'); await addMember(W3.id, jackA, 'member');
  jackB = await createUser('jackie'); await addMember(W3.id, jackB, 'member');
  w3a = await clone(W3.id, jackA, "Jack's Claude", 'jack-claude');
  w3b = await clone(W3.id, jackB, "Jack's Grok", 'jack-grok');

  ownerTok = (await createOAuthToken({ workspaceId: W1.id, userId: W1.owner.userId, scopes: ALL_SCOPES, label: 'travis-bot' })).token;
  adaTok = (await createOAuthToken({ workspaceId: W1.id, userId: ada.userId, scopes: ALL_SCOPES, label: 'ada-bot' })).token;
  // A member token that somehow carries team:read (e.g. minted before this change): the live role check must still deny.
  jackTokAll = (await createOAuthToken({ workspaceId: W1.id, userId: jack.userId, scopes: ALL_SCOPES, label: 'jack-all' })).token;
  const jt = await createOAuthToken({ workspaceId: W1.id, userId: jack.userId, scopes: DEFAULT, label: 'jack-default' });
  jackTokDefault = jt.token;
  await q(`UPDATE bureau.digital_clones SET agent_link_id = $1 WHERE id = $2`, [jt.agentLinkId, jackClone]);
  w3OwnerTok = (await createOAuthToken({ workspaceId: W3.id, userId: W3.owner.userId, scopes: ALL_SCOPES, label: 'w3-bot' })).token;
});
afterAll(async () => {
  await cleanup();
  await admin.end();
});

describe('scopesForRole (pure)', () => {
  it('members never get team:read; owners/admins get it with the normal set; narrow requests respected', async () => {
    const { scopesForRole, resolveScopes, isLeaderRole } = await import('../lib/oauth-scopes');
    expect(scopesForRole(DEFAULT, 'member')).toEqual(DEFAULT);
    expect(scopesForRole([...DEFAULT, 'team:read'], 'member')).toEqual(DEFAULT);
    expect(scopesForRole(['team:read'], null)).toEqual([]);
    expect(scopesForRole(DEFAULT, 'owner')).toEqual([...DEFAULT, 'team:read']);
    expect(scopesForRole(DEFAULT, 'admin')).toEqual([...DEFAULT, 'team:read']);
    expect(scopesForRole([...DEFAULT, 'team:read'], 'owner')).toEqual([...DEFAULT, 'team:read']);
    expect(scopesForRole(['ingest:write'], 'owner')).toEqual(['ingest:write']);
    expect(scopesForRole(['team:read', 'ingest:write'], 'admin')).toEqual(['ingest:write', 'team:read']);
    expect(scopesForRole(resolveScopes(undefined), 'owner')).toContain('team:read');
    expect(scopesForRole(['bogus', ...DEFAULT], 'member')).toContain('bogus'); // still rejected by invalid_scope
    expect([isLeaderRole('owner'), isLeaderRole('admin'), isLeaderRole('member'), isLeaderRole(null)]).toEqual([true, true, false, false]);
  });
});

describe('/api/oauth/me role', () => {
  it('returns owner / admin / member for the signed-in user only', async () => {
    expect((await asJson(mePost, W1.owner, 'http://localhost/api/oauth/me')).body).toMatchObject({ role: 'owner', has_workspace: true });
    expect((await asJson(mePost, ada, 'http://localhost/api/oauth/me')).body.role).toBe('admin');
    expect((await asJson(mePost, jack, 'http://localhost/api/oauth/me')).body.role).toBe('member');
    const loner = await createUser('loner');
    expect((await asJson(mePost, loner, 'http://localhost/api/oauth/me')).body).toMatchObject({ role: null, has_workspace: false });
  });
});

describe('consent (POST /api/oauth/authorize) applies the role', () => {
  it('owner connecting with the default set gets team:read and team_health works', async () => {
    const c = await createClient();
    const at = await consentConnect(W1.owner, c, DEFAULT, 'Travis Claude');
    expect(await linkScopes(at)).toEqual([...DEFAULT, 'team:read']);
    const th = await mcp(at, 'bureau_team_health');
    expect(th.body.error).toBeUndefined();
    expect(th.data.map((r: any) => r.handle)).toContain('jack-claude');
  });

  it('owner with no scopes param (server default) also gets team:read', async () => {
    const at = await consentConnect(W1.owner, await createClient(), undefined, 'Travis Grok');
    expect(await linkScopes(at)).toContain('team:read');
  });

  it('member asking for everything (incl. team:read) does not get it, and team_health is refused', async () => {
    const at = await consentConnect(jack, await createClient(), [...DEFAULT, 'team:read'], 'Jack Cursor');
    expect(await linkScopes(at)).toEqual(DEFAULT);
    expect((await mcp(at, 'bureau_team_health')).body.error.message).toBe('Missing required scope: team:read');
  });

  it('still rejects unknown scopes', async () => {
    sessionUser = null;
    const r = await asJson(authorizePost, W1.owner, 'http://localhost/api/oauth/authorize', {
      client_id: await createClient(), redirect_uri: 'http://localhost/cb', code_challenge: 'x'.repeat(43),
      scopes: ['admin:everything'], agent_label: 'x', approved: true,
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_scope');
  });

  it('reconnecting with the same app + name upgrades an old link that lacked team:read', async () => {
    const clientId = await createClient();
    const verifier = randomBytes(32).toString('base64url');
    const code = await oauth.storeAuthCode({
      userId: W1.owner.userId, workspaceId: W1.id, clientId, redirectUri: 'http://localhost/cb',
      codeChallenge: createHash('sha256').update(verifier).digest('base64url'), resource: null,
      scopes: DEFAULT, agentLabel: 'Old Claude', streamIds: [], allowCreateStreams: true,
    });
    const old = await oauth.exchangeCode(code, verifier, clientId, 'http://localhost/cb', null);
    expect(await linkScopes(old.accessToken)).toEqual(DEFAULT);
    const fresh = await consentConnect(W1.owner, clientId, DEFAULT, 'Old Claude');
    expect(await linkScopes(fresh)).toEqual([...DEFAULT, 'team:read']);
  });
});

describe('device flow applies the role at mint time (no migration)', () => {
  it('owner and admin get team:read; member does not; narrow script scope kept', async () => {
    const o = await deviceConnect(W1.owner, undefined, 'travis-cli');
    expect(await linkScopes(o)).toEqual([...DEFAULT, 'team:read']);
    expect((await mcp(o, 'bureau_whoami')).data.scopes).toContain('team:read');
    expect((await mcp(o, 'bureau_team_health')).body.error).toBeUndefined();

    expect(await linkScopes(await deviceConnect(ada, undefined, 'ada-cli'))).toContain('team:read');

    const m = await deviceConnect(jack, `${DEFAULT.join(' ')} team:read`, 'jack-cli');
    expect(await linkScopes(m)).toEqual(DEFAULT);
    expect((await mcp(m, 'bureau_team_health')).body.error.message).toBe('Missing required scope: team:read');

    expect(await linkScopes(await deviceConnect(W1.owner, 'ingest:write', 'travis-ingest-only'))).toEqual(['ingest:write']);
  });

  it('device_codes still store the requested set (role is unknown until approval)', async () => {
    const start = await devicePost(new NextRequest('http://localhost/api/oauth/device', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'CLI' }),
    }));
    const d = await start.json();
    const [row] = await q(`SELECT scopes FROM bureau.oauth_device_codes WHERE user_code = $1`, [d.user_code]);
    expect(row.scopes).toEqual(DEFAULT);
    await q(`DELETE FROM bureau.oauth_device_codes WHERE user_code = $1`, [d.user_code]);
  });
});

describe('clone lookup', () => {
  it('pure matcher: exact, person, substring, full-name fallback, no wildcards', async () => {
    const { matchClones, resolveMatches, normalizeWho } = await import('../lib/clone-lookup');
    const rows = [
      { id: '00000000-0000-0000-0000-000000000001', display_name: "Jack's Claude", handle: 'jack-claude', owner_user_id: 'u1', owner_email: 'jack@highstreet.market', slack_handle: '@jackq', last_seen_at: null },
      { id: '00000000-0000-0000-0000-000000000002', display_name: "Jill's Grok", handle: 'jill-grok', owner_user_id: 'u2', owner_email: 'jill.lee@highstreet.market', slack_handle: null, last_seen_at: null },
      { id: '00000000-0000-0000-0000-000000000003', display_name: 'Ops 100% Bot', handle: 'ops-bot', owner_user_id: 'u3', owner_email: 'ops@highstreet.market', slack_handle: null, last_seen_at: null },
    ];
    const handles = (who: string) => matchClones(rows, who).map(r => r.handle);
    expect(normalizeWho("  @Jack\u2019s  Claude ")).toBe('jack claude');
    expect(handles('jack')).toEqual(['jack-claude']);
    expect(handles('JACK-CLAUDE')).toEqual(['jack-claude']);
    expect(handles("Jack's Claude")).toEqual(['jack-claude']);
    expect(handles('jack@highstreet.market')).toEqual(['jack-claude']);
    expect(handles('@jackq')).toEqual(['jack-claude']);
    expect(handles('jill')).toEqual(['jill-grok']);       // email local "jill.lee"
    expect(handles('Jack Qiao')).toEqual(['jack-claude']); // falls back to first name
    expect(handles('grok')).toEqual(['jill-grok']);       // substring
    expect(handles('%')).toEqual([]);
    expect(handles('_')).toEqual([]);
    expect(handles('100%')).toEqual(['ops-bot']);          // literal, not a wildcard
    expect(handles('')).toEqual([]);
    expect(resolveMatches([], 'x')).toEqual({ status: 'not_found', query: 'x' });
  });

  it('DB: scoped to one workspace, ambiguous across people, same person -> most recent bot', async () => {
    const { withUser } = await import('../lib/db');
    const { lookupClone } = await import('../lib/clone-lookup');
    const asOwner = (ws: Workspace, who: string) => withUser(ws.owner.userId, ws.owner.email, c => lookupClone(c, ws.id, who));

    const r1 = await asOwner(W1, 'jack');
    expect(r1.status).toBe('found');
    if (r1.status === 'found') { expect(r1.clone.id).toBe(jackClone); expect(r1.clone.owner_email).toBe(jack.email); }
    expect((await asOwner(W1, jackOther.email)).status).toBe('not_found');
    expect((await asOwner(W1, otherJackClone)).status).toBe('not_found');
    const r2 = await asOwner(W2, 'jack-claude');
    expect(r2.status === 'found' && r2.clone.id).toBe(otherJackClone);

    const amb = await asOwner(W3, 'jack');
    expect(amb.status).toBe('ambiguous');
    if (amb.status === 'ambiguous') expect(amb.candidates.map(c => c.id).sort()).toEqual([w3a, w3b].sort());

    const jl = await asOwner(W1, 'jill');
    expect(jl.status).toBe('found');
    if (jl.status === 'found') {
      expect(jl.clone.id).toBe(jillGrok); // Grok has the check-in (and is the most recently seen)
      expect(jl.other_clones_of_same_person.map(c => c.id)).toEqual([jillClaude]);
    }

    // A non-member asking about W1 sees nothing even if they pass W1's id (RLS)
    const { withUser: wu } = await import('../lib/db');
    expect((await wu(W2.owner.userId, W2.owner.email, c => lookupClone(c, W1.id, 'jack'))).status).toBe('not_found');

    // Removed members drop out
    await q(`UPDATE bureau.workspace_members SET removed_at = NOW() WHERE workspace_id = $1 AND user_id = $2`, [W3.id, jackB.userId]);
    const after = await asOwner(W3, 'jack');
    expect(after.status === 'found' && after.clone.id).toBe(w3a);
    await q(`UPDATE bureau.workspace_members SET removed_at = NULL WHERE workspace_id = $1 AND user_id = $2`, [W3.id, jackB.userId]);
  });
});

describe('MCP bureau_ask_question', () => {
  it('owner asks "jack": question routed to Jack\'s clone with an instant latest-check-in preview', async () => {
    const r = await mcp(ownerTok, 'bureau_ask_question', { who: 'jack', question_text: 'Is v2 on track?' });
    expect(r.body.error).toBeUndefined();
    expect(r.data).toMatchObject({
      status: 'asked',
      asked: { handle: 'jack-claude', display_name: "Jack's Claude", owner_email: jack.email },
      from_latest_checkin: { top_priority: 'Ship the v2 release', active: ['release notes'], blocked: ['waiting on design review'], days_old: 0 },
    });
    const [row] = await q(`SELECT target_clone_id, asker_user_id, source::text, status::text, workspace_id FROM bureau.questions WHERE id = $1`, [r.data.question_id]);
    expect(row).toEqual({ target_clone_id: jackClone, asker_user_id: W1.owner.userId, source: 'mcp', status: 'open', workspace_id: W1.id });

    // Jack's own AI sees it with the existing tool, answers; the owner reads the answer by name
    const mine = await mcp(jackTokDefault, 'bureau_get_questions', { status: 'open' });
    expect(mine.data.map((x: any) => x.id ?? x.question_id)).toContain(r.data.question_id);
    expect((await mcp(jackTokDefault, 'bureau_answer_question', { question_id: r.data.question_id, answer_text: 'Yes, Friday.' })).body.error).toBeUndefined();
    const read = await mcp(ownerTok, 'bureau_get_questions', { who: 'jack' });
    expect(read.data.status).toBe('found');
    expect(read.data.questions.find((x: any) => x.id === r.data.question_id)).toMatchObject({ answer_text: 'Yes, Friday.', status: 'answered', source: 'mcp' });
  });

  it('admin can ask; full name and email resolve; no check-in -> preview null', async () => {
    expect((await mcp(adaTok, 'bureau_ask_question', { who: 'Jack Qiao', question_text: 'q' })).data.asked.handle).toBe('jack-claude');
    expect((await mcp(adaTok, 'bureau_ask_question', { who: jack.email, question_text: 'q' })).data.asked.handle).toBe('jack-claude');
    const n = await mcp(adaTok, 'bureau_ask_question', { who: 'nova', question_text: 'q' });
    expect(n.data.status).toBe('asked');
    expect(n.data.from_latest_checkin).toBeNull();
  });

  it('ambiguous -> candidates and nothing created; not found -> message and nothing created', async () => {
    const before = [await questionCount(w3a), await questionCount(w3b)];
    const amb = await mcp(w3OwnerTok, 'bureau_ask_question', { who: 'jack', question_text: 'which jack?' });
    expect(amb.data.status).toBe('ambiguous');
    expect(amb.data.candidates.map((c: any) => c.handle).sort()).toEqual(['jack-claude', 'jack-grok']);
    expect([await questionCount(w3a), await questionCount(w3b)]).toEqual(before);
    const exact = await mcp(w3OwnerTok, 'bureau_ask_question', { who: 'jack-grok', question_text: 'ok' });
    expect(exact.data.asked.handle).toBe('jack-grok');
    expect((await mcp(ownerTok, 'bureau_ask_question', { who: 'nobody-here', question_text: 'x' })).data.status).toBe('not_found');
  });

  it('cross-workspace: W1 owner cannot reach W2\'s Jack by email or id, and never sees their check-in', async () => {
    const before = await questionCount(otherJackClone);
    for (const who of [jackOther.email, otherJackClone]) {
      const r = await mcp(ownerTok, 'bureau_ask_question', { who, question_text: 'leak?' });
      expect(r.data.status).toBe('not_found');
      expect(JSON.stringify(r.body)).not.toContain('SECRET');
    }
    expect(await questionCount(otherJackClone)).toBe(before);
    const th = await mcp(ownerTok, 'bureau_team_health', { who: jackOther.email });
    expect(th.data.status).toBe('not_found');
  });

  it('members are refused even with a team:read token; missing scope and bad args are errors', async () => {
    const before = await questionCount(jillGrok);
    const r = await mcp(jackTokAll, 'bureau_ask_question', { who: 'jill', question_text: 'x' });
    expect(r.body.error.message).toBe('team:read is only for workspace owners and admins');
    expect((await mcp(jackTokAll, 'bureau_team_health')).body.error.message).toBe('team:read is only for workspace owners and admins');
    expect((await mcp(jackTokAll, 'bureau_get_questions', { who: 'jill' })).body.error.message).toBe('team:read is only for workspace owners and admins');
    expect((await mcp(jackTokDefault, 'bureau_ask_question', { who: 'jill', question_text: 'x' })).body.error.message).toBe('Missing required scope: team:read');
    expect(await questionCount(jillGrok)).toBe(before);
    expect((await mcp(ownerTok, 'bureau_ask_question', { who: 'jill' })).body.error.code).toBe(-32602);
    expect((await mcp(ownerTok, 'bureau_ask_question', { who: 'jill', question_text: 'x'.repeat(2001) })).body.error.code).toBe(-32602);
  });

  it('a demoted admin loses team access immediately, without reconnecting', async () => {
    expect((await mcp(adaTok, 'bureau_team_health')).body.error).toBeUndefined();
    await q(`UPDATE bureau.workspace_members SET role = 'member' WHERE workspace_id = $1 AND user_id = $2`, [W1.id, ada.userId]);
    expect((await mcp(adaTok, 'bureau_team_health')).body.error.message).toBe('team:read is only for workspace owners and admins');
    await q(`UPDATE bureau.workspace_members SET role = 'admin' WHERE workspace_id = $1 AND user_id = $2`, [W1.id, ada.userId]);
  });
});

describe('MCP team_health / get_questions with who', () => {
  it('team_health without who keeps the full list; with who returns that person (all their bots)', async () => {
    const all = await mcp(ownerTok, 'bureau_team_health');
    expect(Array.isArray(all.data)).toBe(true);
    expect(all.data.map((r: any) => r.clone_id)).toEqual(expect.arrayContaining([jackClone, jillGrok, novaClone]));
    expect(all.data.map((r: any) => r.clone_id)).not.toContain(otherJackClone);
    const one = await mcp(ownerTok, 'bureau_team_health', { who: 'jack' });
    expect(one.data.status).toBe('found');
    // Jack also connected other bots earlier in this file (auto-clones); all of his come back, nobody else's
    const jackIds = (await q<{ id: string }>(`SELECT id FROM bureau.digital_clones WHERE workspace_id = $1 AND owner_user_id = $2`, [W1.id, jack.userId])).map(r => r.id);
    expect(jackIds.length).toBeGreaterThan(1);
    expect(one.data.clones.map((r: any) => r.clone_id).sort()).toEqual([...jackIds].sort());
    expect(one.data.clones.find((r: any) => r.clone_id === jackClone).latest_heartbeat.top_priority).toBe('Ship the v2 release');
    const jl = await mcp(ownerTok, 'bureau_team_health', { who: 'jill' });
    expect(jl.data.clones.map((r: any) => r.clone_id).sort()).toEqual([jillClaude, jillGrok].sort());
    expect((await mcp(w3OwnerTok, 'bureau_team_health', { who: 'jack' })).data.status).toBe('ambiguous');
  });

  it('get_questions without who is unchanged (own clone only)', async () => {
    const r = await mcp(jackTokDefault, 'bureau_get_questions', { clone_id: jillGrok });
    expect(r.body.error).toBeTruthy();
  });

  it('tools/list advertises bureau_ask_question with who + question_text required', async () => {
    const res = await mcpPost(new NextRequest('http://localhost/api/mcp', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ownerTok}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    }));
    const tools = (await res.json()).result.tools as any[];
    const ask = tools.find(t => t.name === 'bureau_ask_question');
    expect(ask.inputSchema.required).toEqual(['who', 'question_text']);
    expect(tools.find(t => t.name === 'bureau_team_health').inputSchema.properties.who).toBeTruthy();
    expect(tools.find(t => t.name === 'bureau_get_questions').inputSchema.properties.who).toBeTruthy();
  });
});

describe('POST /api/questions instant preview', () => {
  const url = 'http://localhost/api/questions';
  it('by clone id: returns the latest check-in (not the older one) and the question stays open', async () => {
    const r = await asJson(questionsPost, W1.owner, url, { target_clone_id: jackClone, question_text: 'What are you on today?' });
    expect(r.status).toBe(200);
    expect(r.body.target).toMatchObject({ id: jackClone, handle: 'jack-claude' });
    expect(r.body.preview).toMatchObject({ top_priority: 'Ship the v2 release', blocked: ['waiting on design review'], days_old: 0 });
    const [row] = await q(`SELECT status::text, source::text FROM bureau.questions WHERE id = $1`, [r.body.questionId]);
    expect(row).toEqual({ status: 'open', source: 'web' });
    const list = await asJson(questionsGet, W1.owner, url);
    expect(list.body.questions.map((x: any) => x.id)).toContain(r.body.questionId);
  });

  it('by who; no check-in -> preview null; ambiguous -> 409 candidates; foreign clone -> 404', async () => {
    expect((await asJson(questionsPost, jill, url, { who: 'jack', question_text: 'hi' })).body.preview.top_priority).toBe('Ship the v2 release');
    expect((await asJson(questionsPost, W1.owner, url, { target_clone_id: novaClone, question_text: 'hi' })).body.preview).toBeNull();
    const amb = await asJson(questionsPost, W3.owner, url, { who: 'jack', question_text: 'hi' });
    expect(amb.status).toBe(409);
    expect(amb.body.candidates).toHaveLength(2);
    const before = await questionCount(otherJackClone);
    const foreign = await asJson(questionsPost, W1.owner, url, { target_clone_id: otherJackClone, question_text: 'leak?' });
    expect(foreign.status).toBe(404);
    expect(JSON.stringify(foreign.body)).not.toContain('SECRET');
    expect((await asJson(questionsPost, W1.owner, url, { who: jackOther.email, question_text: 'leak?' })).status).toBe(404);
    expect(await questionCount(otherJackClone)).toBe(before);
    expect((await asJson(questionsPost, W1.owner, url, { question_text: 'no target' })).status).toBe(400);
    expect((await asJson(questionsPost, null, url, { target_clone_id: jackClone, question_text: 'x' })).status).toBe(401);
  });
});

describe('Top Floor / Ask-your-team render', () => {
  it('Top Floor header links Team and Questions and shows the Ask box', async () => {
    const React = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { default: TopFloor } = await import('../app/top-floor/page-content');
    const html = renderToString(React.createElement(TopFloor, { streams: [], recentLogs: [], tokensCount: 0, dueDecisions: [], userEmail: 'x@y.z' }));
    expect(html).toContain('>Team<');
    expect(html).toContain('>Questions<');
    expect(html).toContain('Ask your team');
  });

  it('CheckinPreviewCard renders the check-in, or a no-check-in note', async () => {
    const React = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { CheckinPreviewCard } = await import('../components/AskTeamBox');
    const html = renderToString(React.createElement(CheckinPreviewCard, { name: "Jack's Claude", preview: {
      date: '2026-11-24', days_old: 0, top_priority: 'Ship v2', active: ['notes'], blocked: ['design review'], decisions_waiting_on_me: [], out_of_office: false,
    } }));
    expect(html).toContain('Ship v2');
    expect(html).toContain('design review');
    expect(html).toContain('today');
    expect(renderToString(React.createElement(CheckinPreviewCard, { name: 'Nova', preview: null }))).toContain('check-in yet');
  });
});
