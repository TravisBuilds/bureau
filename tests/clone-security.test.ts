/**
 * Digital Clone security tests — real route handlers, real bureau_app role.
 * See tests/helpers/clone-fixtures.ts and the README for setup.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';
import {
  q, cleanup, admin, uid, createWorkspace, createUser, addMember, createClient,
  createOAuthToken, createLegacyToken, createStream, type Workspace, type Member,
} from './helpers/clone-fixtures';

// ---- Session mock: the only thing faked is the Supabase cookie session. ----
// getAuthUser()/requireAuth() still run for real, including bureau.user_workspaces().
let sessionUser: { id: string; email: string } | null = null;
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, delete: () => undefined }) }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: sessionUser } }) } }),
}));

const SLACK_SECRET = 'clone-test-signing-secret';
process.env.SLACK_SIGNING_SECRET = SLACK_SECRET;
process.env.SLACK_BOT_TOKEN = 'xoxb-clone-test-not-real';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

// ---- fetch mock: record Slack API calls, never hit the network. ----
const slackCalls: any[] = [];
vi.stubGlobal('fetch', async (url: any, init?: any) => {
  const u = String(url);
  if (u.startsWith('https://slack.com/api/')) {
    slackCalls.push({ url: u, body: JSON.parse(init?.body ?? '{}') });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new Error(`Unexpected network call in test: ${u}`);
});

let mcpPost: any, ingestPost: any, slackPost: any, clonesGet: any, questionsGet: any, membersGet: any, invitePost: any;
let teamHealthGet: any, streamsGet: any, authorizePost: any, tokenPost: any, devicePost: any, deviceApprovePost: any, connectionsGet: any, connectionDelete: any;

let A: Workspace, B: Workspace;
let memberA: Member, memberB2: Member;
let tokA: string, tokB: string, tokRestricted: string;
let cloneA: string, cloneB: string, handleA: string, handleB: string;
let streamX: string;
let teamA: string, teamB: string;

const mcp = async (token: string, name: string, args: any = {}) => {
  const res = await mcpPost(new NextRequest('http://localhost/api/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  }));
  const body = await res.json();
  return { status: res.status, body, data: body.result ? JSON.parse(body.result.content[0].text) : undefined };
};

const ingest = async (token: string, stream: string) => {
  const res = await ingestPost(new NextRequest('http://localhost/api/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ type: 'finding', stream, content: `clone-test ${uid()}` }),
  }));
  return { status: res.status, body: await res.json() };
};

const asUser = async (handler: any, user: Member | null) => {
  sessionUser = user ? { id: user.userId, email: user.email } : null;
  const res = await handler(new NextRequest('http://localhost/api/x'));
  sessionUser = null;
  return { status: res.status, body: await res.json() };
};

const slack = async (payload: any, opts: { ts?: string; sig?: string; retry?: string } = {}) => {
  const raw = JSON.stringify(payload);
  const ts = opts.ts ?? String(Math.floor(Date.now() / 1000));
  const sig = opts.sig ?? 'v0=' + createHmac('sha256', SLACK_SECRET).update(`v0:${ts}:${raw}`).digest('hex');
  const headers: Record<string, string> = {
    'content-type': 'application/json', 'x-slack-request-timestamp': ts, 'x-slack-signature': sig,
  };
  if (opts.retry) headers['x-slack-retry-num'] = opts.retry;
  const res = await slackPost(new NextRequest('http://localhost/api/slack/events', { method: 'POST', headers, body: raw }));
  return { status: res.status, body: await res.text() };
};
const mention = (eventId: string, teamId: string, text: string) => ({
  type: 'event_callback', event_id: eventId, team_id: teamId,
  event: { type: 'app_mention', text, user: 'U0TEST', channel: 'C0TEST', ts: '1795500000.000100' },
});
const slackQuestions = async (cloneId: string) =>
  (await q<{ n: number }>(`SELECT count(*)::int n FROM bureau.questions WHERE target_clone_id = $1 AND source = 'slack'`, [cloneId]))[0].n;
const eventStored = async (id: string) =>
  (await q<{ n: number }>(`SELECT count(*)::int n FROM bureau.slack_event_ids WHERE event_id = $1`, [id]))[0].n;

beforeAll(async () => {
  ({ POST: mcpPost } = await import('../app/api/mcp/route'));
  ({ POST: ingestPost } = await import('../app/api/ingest/route'));
  ({ POST: slackPost } = await import('../app/api/slack/events/route'));
  ({ GET: clonesGet } = await import('../app/api/clones/route'));
  ({ GET: questionsGet } = await import('../app/api/questions/route'));
  ({ GET: membersGet } = await import('../app/api/team/members/route'));
  ({ POST: invitePost } = await import('../app/api/team/invite/route'));
  ({ GET: streamsGet } = await import('../app/api/streams/route'));
  ({ GET: teamHealthGet } = await import('../app/api/team-health/route'));
  ({ POST: authorizePost } = await import('../app/api/oauth/authorize/route'));
  ({ POST: tokenPost } = await import('../app/api/oauth/token/route'));
  ({ POST: devicePost } = await import('../app/api/oauth/device/route'));
  ({ POST: deviceApprovePost } = await import('../app/api/oauth/device/approve/route'));
  ({ GET: connectionsGet } = await import('../app/api/connections/route'));
  ({ DELETE: connectionDelete } = await import('../app/api/connections/[id]/route'));

  // Guard: the app role must not have auth schema access or secret-table grants.
  const [g] = await q(`SELECT has_schema_privilege('bureau_app','auth','USAGE') AS auth_usage,
    (SELECT count(*)::int FROM pg_auth_members WHERE member = 'bureau_app'::regrole) AS memberships,
    (SELECT count(*)::int FROM information_schema.role_table_grants WHERE grantee='bureau_app'
       AND table_schema='bureau' AND table_name IN ('oauth_tokens','oauth_codes','oauth_device_codes')) AS secret_grants`);
  if (g.auth_usage || g.memberships || g.secret_grants) {
    throw new Error(`bureau_app is over-privileged in the test DB: ${JSON.stringify(g)}`);
  }

  A = await createWorkspace('wsA');
  B = await createWorkspace('wsB');
  memberA = await createUser('wsA-member');
  await addMember(A.id, memberA, 'member');
  memberB2 = await createUser('wsA-twobots');
  await addMember(A.id, memberB2, 'member');
  tokA = (await createOAuthToken({ workspaceId: A.id, userId: A.owner.userId, allowCreateStreams: true })).token;
  tokB = (await createOAuthToken({ workspaceId: B.id, userId: B.owner.userId, allowCreateStreams: true })).token;
  streamX = await createStream(A.id, `X-${uid()}`);
  await createStream(A.id, `Y-${uid()}`);
  tokRestricted = (await createOAuthToken({
    workspaceId: A.id, userId: A.owner.userId, scopes: ['ingest:write'], streamIds: [streamX], allowCreateStreams: false,
  })).token;

  handleA = `clonea${uid()}`; handleB = `cloneb${uid()}`;
  const ra = await mcp(tokA, 'bureau_register_clone', { display_name: 'Clone A', handle: handleA, vendor: 'cursor' });
  const rb = await mcp(tokB, 'bureau_register_clone', { display_name: 'Clone B', handle: handleB, vendor: 'cursor' });
  if (!ra.data?.clone_id || !rb.data?.clone_id) throw new Error(`register_clone failed: ${JSON.stringify([ra.body, rb.body])}`);
  cloneA = ra.data.clone_id; cloneB = rb.data.clone_id;

  teamA = `TA${uid()}`; teamB = `TB${uid()}`;
  await q(`INSERT INTO bureau.slack_installations (workspace_id, team_id, installed_by) VALUES ($1,$2,$3), ($4,$5,$6)`,
    [A.id, teamA, A.owner.userId, B.id, teamB, B.owner.userId]);
});

afterAll(async () => {
  await cleanup();
  await admin.end();
  const { closePools } = await import('../lib/db').catch(() => ({ closePools: undefined as any }));
  if (typeof closePools === 'function') await closePools();
});

describe('MCP clone tools: own workspace succeeds, other workspace rejected', () => {
  const hb = { date: '2026-11-23', top_priority: 'Ship onboarding', blocked: ['Waiting on legal'], active: ['Docs'] };

  it('register_clone: own handle works; another member cannot take over an existing handle', async () => {
    const tokMember = (await createOAuthToken({ workspaceId: A.id, userId: memberA.userId })).token;
    const r = await mcp(tokMember, 'bureau_register_clone', { display_name: 'Hijack', handle: handleA, vendor: 'custom' });
    expect(r.body.error?.message).toMatch(/HANDLE_TAKEN/);
    const [row] = await q(`SELECT display_name, owner_user_id FROM bureau.digital_clones WHERE id = $1`, [cloneA]);
    expect(row).toEqual({ display_name: 'Clone A', owner_user_id: A.owner.userId });
  });

  it('update_profile', async () => {
    expect((await mcp(tokA, 'bureau_update_profile', { clone_id: cloneA, responsibilities: 'Onboarding' })).data).toEqual({ success: true });
    const cross = await mcp(tokA, 'bureau_update_profile', { clone_id: cloneB, responsibilities: 'HACKED' });
    expect(cross.body.error?.message).toBe('Clone not found or access denied');
    expect((await q(`SELECT count(*)::int n FROM bureau.clone_profiles WHERE clone_id = $1 AND responsibilities = 'HACKED'`, [cloneB]))[0].n).toBe(0);
  });

  it('post_heartbeat', async () => {
    expect((await mcp(tokA, 'bureau_post_heartbeat', { clone_id: cloneA, ...hb })).data).toEqual({ success: true });
    const cross = await mcp(tokA, 'bureau_post_heartbeat', { clone_id: cloneB, ...hb, top_priority: 'HACKED' });
    expect(cross.body.error?.message).toBe('Clone not found or access denied');
    expect((await q(`SELECT count(*)::int n FROM bureau.clone_heartbeats WHERE clone_id = $1`, [cloneB]))[0].n).toBe(0);
  });

  it('get_questions', async () => {
    await q(`SELECT bureau.ask_question($1, 'own question', $2, NULL, NULL, $3, NULL, 'web')`, [A.id, A.owner.userId, cloneA]);
    await q(`SELECT bureau.ask_question($1, 'B secret question', $2, NULL, NULL, $3, NULL, 'web')`, [B.id, B.owner.userId, cloneB]);
    const own = await mcp(tokA, 'bureau_get_questions', { clone_id: cloneA });
    expect(own.body.error).toBeUndefined();
    expect(own.data.map((x: any) => x.question_text)).toContain('own question');
    const cross = await mcp(tokA, 'bureau_get_questions', { clone_id: cloneB });
    expect(cross.body.error?.message).toBe('Clone not found or access denied');
    expect(JSON.stringify(cross.body)).not.toContain('B secret question');
  });

  it('answer_question', async () => {
    const [{ id: qa }] = await q(`SELECT bureau.ask_question($1,'qa',$2,NULL,NULL,$3,NULL,'web') id`, [A.id, A.owner.userId, cloneA]);
    const [{ id: qb }] = await q(`SELECT bureau.ask_question($1,'qb',$2,NULL,NULL,$3,NULL,'web') id`, [B.id, B.owner.userId, cloneB]);
    expect((await mcp(tokA, 'bureau_answer_question', { question_id: qa, answer_text: 'done' })).data).toEqual({ success: true });
    const cross = await mcp(tokA, 'bureau_answer_question', { question_id: qb, answer_text: 'HACKED' });
    expect(cross.body.error?.message).toBe('Question not found or access denied');
    expect((await q(`SELECT status::text, answer_text FROM bureau.questions WHERE id = $1`, [qb]))[0]).toEqual({ status: 'open', answer_text: null });
  });

  it('escalate_question', async () => {
    const [{ id: qa }] = await q(`SELECT bureau.ask_question($1,'qa2',$2,NULL,NULL,$3,NULL,'web') id`, [A.id, A.owner.userId, cloneA]);
    const [{ id: qb }] = await q(`SELECT bureau.ask_question($1,'qb2',$2,NULL,NULL,$3,NULL,'web') id`, [B.id, B.owner.userId, cloneB]);
    expect((await mcp(tokA, 'bureau_escalate_question', { question_id: qa, escalation_reason: 'needs owner' })).data).toEqual({ success: true });
    const cross = await mcp(tokA, 'bureau_escalate_question', { question_id: qb, escalation_reason: 'HACKED' });
    expect(cross.body.error?.message).toBe('Question not found or access denied');
    expect((await q(`SELECT status::text FROM bureau.questions WHERE id = $1`, [qb]))[0].status).toBe('open');
  });

  it('team_health returns only own workspace clones', async () => {
    const r = await mcp(tokA, 'bureau_team_health');
    expect(r.body.error).toBeUndefined();
    const ids = r.data.map((c: any) => c.clone_id);
    expect(ids).toContain(cloneA);
    expect(ids).not.toContain(cloneB);
  });

  it('scope enforcement: ingest-only token cannot use clone tools', async () => {
    const r = await mcp(tokRestricted, 'bureau_update_profile', { clone_id: cloneA, responsibilities: 'x' });
    expect(r.body.error?.message).toMatch(/Missing required scope: clone:write/);
  });
});

describe('connect flows mint working tokens (as bureau_app)', () => {
  const whoami = async (token: string) => (await mcp(token, 'bureau_whoami')).data;

  it('device flow: start -> approve -> poll returns a token scoped to the approved stream', async () => {
    const srv = await import('../lib/oauth-server');
    const grants = await import('../lib/oauth-grants');
    const start = await srv.startDeviceFlow('Clone test CLI', ['ingest:write', 'clone:write']);
    expect(await grants.approveDeviceCode(start.userCode, A.owner.userId, A.id, 'device-bot', [streamX], false)).toBe(true);
    const poll = await srv.pollDeviceCode(start.deviceCode);
    expect(poll.status).toBe('approved');
    expect(poll.accessToken).toMatch(/^bureau_at_/);
    expect(await whoami(poll.accessToken!)).toMatchObject({ agent_label: 'device-bot', allowed_streams: 1, allow_create_streams: false });
    await expect(srv.pollDeviceCode(start.deviceCode)).rejects.toThrow();
  });

  it('authorization code + PKCE: exchange returns a working token', async () => {
    const { createHash, randomBytes } = await import('crypto');
    const srv = await import('../lib/oauth-server');
    const clientId = await createClient('http://localhost/cb');
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const code = await srv.storeAuthCode({
      userId: A.owner.userId, workspaceId: A.id, clientId, redirectUri: 'http://localhost/cb', codeChallenge: challenge,
      resource: null, scopes: ['ingest:write'], agentLabel: 'code-bot', streamIds: [streamX], allowCreateStreams: false,
    });
    await expect(srv.exchangeCode(code, 'wrong-verifier', clientId, 'http://localhost/cb', null)).rejects.toThrow();
    const code2 = await srv.storeAuthCode({
      userId: A.owner.userId, workspaceId: A.id, clientId, redirectUri: 'http://localhost/cb', codeChallenge: challenge,
      resource: null, scopes: ['ingest:write'], agentLabel: 'code-bot', streamIds: [streamX], allowCreateStreams: false,
    });
    const tok = await srv.exchangeCode(code2, verifier, clientId, 'http://localhost/cb', null);
    expect(tok.accessToken).toMatch(/^bureau_at_/);
    expect(await whoami(tok.accessToken)).toMatchObject({ agent_label: 'code-bot', allowed_streams: 1 });
    await expect(srv.exchangeCode(code2, verifier, clientId, 'http://localhost/cb', null)).rejects.toThrow(); // single use
  });

  it('bureau_list_streams returns exactly the allowed streams', async () => {
    const r = await mcp(tokRestricted, 'bureau_list_streams');
    expect(r.body.error).toBeUndefined();
    expect(r.data.map((s: any) => s.id)).toEqual([streamX]);
    const all = await mcp(tokA, 'bureau_list_streams');
    expect(all.data.map((s: any) => s.id)).toContain(streamX);
    expect((await mcp(tokB, 'bureau_list_streams')).data.map((s: any) => s.id)).not.toContain(streamX);
  });

  it('bureau_report_cost: allowed stream logs pending; other stream rejected', async () => {
    const [{ name }] = await q(`SELECT name FROM bureau.streams WHERE id = $1`, [streamX]);
    const ok = await mcp(tokRestricted, 'bureau_report_cost', { type: 'cost', stream: name, content: 'clone-test $1' });
    expect(ok.body.error).toBeUndefined();
    const [row] = await q(`SELECT status::text, agent_link_id FROM bureau.ingest_log WHERE id = $1`, [ok.data.ingest_id]);
    expect(row.status).toBe('pending');
    expect(row.agent_link_id).not.toBeNull();
    const [{ name: other }] = await q(`SELECT name FROM bureau.streams WHERE workspace_id = $1 AND id <> $2 LIMIT 1`, [A.id, streamX]);
    const bad = await mcp(tokRestricted, 'bureau_report_cost', { type: 'cost', stream: other, content: 'nope' });
    expect(bad.status).toBe(403);
    expect(bad.body.error?.message).toMatch(/^Stream not allowed for this agent/);
  });
});

describe('connect flows through the real routes (what the consent/device pages call)', () => {
  const asJson = async (handler: any, user: Member | null, url: string, body?: any, extra?: any) => {
    sessionUser = user ? { id: user.userId, email: user.email } : null;
    const res = await handler(new NextRequest(url, body === undefined ? { method: 'GET' } : {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }), extra);
    sessionUser = null;
    return { status: res.status, body: await res.json() };
  };
  const token = async (form: Record<string, string>) => {
    const res = await tokenPost(new NextRequest('http://localhost/api/oauth/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString(),
    }));
    return { status: res.status, body: await res.json() };
  };

  it('GET /api/streams lists own workspace streams (consent + device pages)', async () => {
    const r = await asJson(streamsGet, A.owner, 'http://localhost/api/streams');
    expect(r.status).toBe(200);
    expect(r.body.streams.map((x: any) => x.id)).toContain(streamX);
    const rb = await asJson(streamsGet, B.owner, 'http://localhost/api/streams');
    expect(rb.body.streams.map((x: any) => x.id)).not.toContain(streamX);
  });

  it('browser connect: authorize with a chosen stream -> token -> scoped bot; foreign stream rejected', async () => {
    const { createHash, randomBytes } = await import('crypto');
    const clientId = await createClient('http://localhost/cb');
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const consent = (stream_ids: string[]) => asJson(authorizePost, A.owner, 'http://localhost/api/oauth/authorize', {
      client_id: clientId, redirect_uri: 'http://localhost/cb', state: 's1', code_challenge: challenge,
      scopes: ['ingest:write', 'clone:write'], agent_label: 'browser-bot', stream_ids, allow_create_streams: false, approved: true,
    });
    const foreign = await createStream(B.id, `B-${uid()}`);
    expect((await consent([foreign])).status).toBe(400);
    const c = await consent([streamX]);
    expect(c.status).toBe(200);
    const t = await token({ grant_type: 'authorization_code', code: c.body.code, code_verifier: verifier, client_id: clientId, redirect_uri: 'http://localhost/cb' });
    expect(t.status).toBe(200);
    expect(t.body.access_token).toMatch(/^bureau_at_/);
    expect((await mcp(t.body.access_token, 'bureau_whoami')).data).toMatchObject({ agent_label: 'browser-bot', allowed_streams: 1 });

    // refresh rotation keeps the same bot binding; reusing the old refresh token fails
    const r1 = await token({ grant_type: 'refresh_token', refresh_token: t.body.refresh_token, client_id: clientId });
    expect(r1.status).toBe(200);
    expect((await mcp(r1.body.access_token, 'bureau_whoami')).data).toMatchObject({ agent_label: 'browser-bot', allowed_streams: 1 });
    expect((await token({ grant_type: 'refresh_token', refresh_token: t.body.refresh_token, client_id: clientId })).status).not.toBe(200);
  });

  it('two device-flow bots of the same user each resolve to their own link', async () => {
    const srv = await import('../lib/oauth-server');
    const grants = await import('../lib/oauth-grants');
    const other = await createStream(A.id, `Z-${uid()}`);
    const connect = async (label: string, streams: string[], create: boolean) => {
      const st = await srv.startDeviceFlow('Two-bot CLI', ['ingest:write']);
      expect(await grants.approveDeviceCode(st.userCode, memberB2.userId, A.id, label, streams, create)).toBe(true);
      return (await srv.pollDeviceCode(st.deviceCode)).accessToken!;
    };
    const t1 = await connect('narrow-bot', [streamX], false);
    const t2 = await connect('wide-bot', [streamX, other], true);
    expect((await mcp(t1, 'bureau_whoami')).data).toMatchObject({ agent_label: 'narrow-bot', allowed_streams: 1, allow_create_streams: false });
    expect((await mcp(t2, 'bureau_whoami')).data).toMatchObject({ agent_label: 'wide-bot', allowed_streams: 2, allow_create_streams: true });
    const [{ name: otherName }] = await q(`SELECT name FROM bureau.streams WHERE id = $1`, [other]);
    expect((await ingest(t1, otherName)).status).toBe(403);
    expect((await ingest(t2, otherName)).status).toBe(200);
  });

  it('device connect via routes, then /api/connections lists it and DELETE revokes it', async () => {
    const start = await devicePost(new NextRequest('http://localhost/api/oauth/device', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Route CLI', scope: 'ingest:write clone:write' }),
    }));
    const d = await start.json();
    expect(start.status).toBe(200);
    expect((await token({ grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: d.device_code })).body.error).toBe('authorization_pending');
    const ap = await asJson(deviceApprovePost, A.owner, 'http://localhost/api/oauth/device/approve',
      { user_code: d.user_code, agent_label: 'route-device-bot', stream_ids: [streamX], allow_create_streams: false });
    expect(ap.status).toBe(200);
    const t = await token({ grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: d.device_code });
    expect(t.status).toBe(200);
    const at = t.body.access_token;
    expect((await mcp(at, 'bureau_whoami')).data).toMatchObject({ agent_label: 'route-device-bot', allowed_streams: 1 });

    const list = await asJson(connectionsGet, A.owner, 'http://localhost/api/connections');
    expect(list.status).toBe(200);
    const conn = list.body.connections.find((c: any) => c.agent_links.some((l: any) => l.agent_label === 'route-device-bot'));
    expect(conn).toBeTruthy();
    expect((await asJson(connectionsGet, B.owner, 'http://localhost/api/connections')).body.connections.map((c: any) => c.id)).not.toContain(conn.id);

    sessionUser = { id: B.owner.userId, email: B.owner.email };
    const foreignDel = await connectionDelete(new NextRequest(`http://localhost/api/connections/${conn.id}`, { method: 'DELETE' }), { params: Promise.resolve({ id: conn.id }) });
    sessionUser = null;
    expect(foreignDel.status).toBe(404);
    expect((await mcp(at, 'bureau_whoami')).status).toBe(200);

    sessionUser = { id: A.owner.userId, email: A.owner.email };
    const del = await connectionDelete(new NextRequest(`http://localhost/api/connections/${conn.id}`, { method: 'DELETE' }), { params: Promise.resolve({ id: conn.id }) });
    sessionUser = null;
    expect(del.status).toBe(200);
    expect((await mcp(at, 'bureau_whoami')).status).toBe(401);
  });
});

describe('/api/ingest', () => {
  it('OAuth token: allowed stream -> 200 and logged as pending', async () => {
    const r = await ingest(tokRestricted, streamX);
    expect(r.status).toBe(200);
    const [row] = await q(`SELECT status::text, token_id, agent_link_id FROM bureau.ingest_log WHERE id = $1`, [r.body.ingest_id]);
    expect(row.status).toBe('pending');
    expect(row.token_id).toBeNull();
    expect(row.agent_link_id).not.toBeNull();
  });

  it('OAuth token: disallowed stream -> 403', async () => {
    const [{ name }] = await q(`SELECT name FROM bureau.streams WHERE workspace_id = $1 AND id <> $2 LIMIT 1`, [A.id, streamX]);
    const r = await ingest(tokRestricted, name);
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('Stream not in allowed list for this token');
  });

  it('OAuth token: create disabled -> 403 and no stream created', async () => {
    const name = `NEW-${uid()}`;
    const r = await ingest(tokRestricted, name);
    expect(r.status).toBe(403);
    expect((await q(`SELECT count(*)::int n FROM bureau.streams WHERE workspace_id = $1 AND name = $2`, [A.id, name]))[0].n).toBe(0);
  });

  it('legacy pilot token: still pending and last_used_at updated', async () => {
    const { token, tokenId } = await createLegacyToken(A.id);
    const r = await ingest(token, streamX);
    expect(r.status).toBe(200);
    const [row] = await q(`SELECT status::text, token_id FROM bureau.ingest_log WHERE id = $1`, [r.body.ingest_id]);
    expect(row).toEqual({ status: 'pending', token_id: tokenId });
    const [t] = await q(`SELECT last_used_at FROM bureau.ingest_tokens WHERE id = $1`, [tokenId]);
    expect(t.last_used_at).not.toBeNull();
  });
});

describe('sign-in and team invites', () => {
  const invite = async (by: Member, email: string, role = 'member') => {
    sessionUser = { id: by.userId, email: by.email };
    const res = await invitePost(new NextRequest('http://localhost/api/team/invite', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, role }),
    }));
    sessionUser = null;
    return { status: res.status, body: await res.json() };
  };

  it('existing owner with no pending invites can still sign in', async () => {
    const { handlePostLogin } = await import('../lib/post-login');
    const r = await handlePostLogin(A.owner.userId, A.owner.email);
    expect(r.workspaceId).toBe(A.id);
  });

  it('owner invites -> invitee signs in -> joins with email and sees the team', async () => {
    const { handlePostLogin } = await import('../lib/post-login');
    const invitee = await createUser('wsA-invitee');
    expect((await invite(A.owner, invitee.email)).status).toBe(200);
    const r = await handlePostLogin(invitee.userId, invitee.email);
    expect(r.workspaceId).toBe(A.id);
    const [m] = await q(`SELECT email, role::text, removed_at FROM bureau.workspace_members WHERE workspace_id = $1 AND user_id = $2`, [A.id, invitee.userId]);
    expect(m).toEqual({ email: invitee.email.toLowerCase(), role: 'member', removed_at: null });
    const members = await asUser(membersGet, invitee);
    expect(members.status).toBe(200);
    expect(members.body.members.find((x: any) => x.user_id === invitee.userId)?.email).toBe(invitee.email.toLowerCase());
  });

  it('a plain member cannot invite', async () => {
    const plain = await createUser('wsA-plain');
    await addMember(A.id, plain, 'member');
    const r = await invite(plain, `x-${uid()}@clone-test.local`);
    expect(r.status).not.toBe(200);
    expect((await q(`SELECT count(*)::int n FROM bureau.workspace_invites WHERE workspace_id = $1 AND invited_by = $2`, [A.id, plain.userId]))[0].n).toBe(0);
  });
});

describe('web routes under bureau_app RLS', () => {
  it('active member sees own workspace rows only', async () => {
    const clones = await asUser(clonesGet, A.owner);
    expect(clones.status).toBe(200);
    const ids = clones.body.clones.map((c: any) => c.id);
    expect(ids).toContain(cloneA);
    expect(ids).not.toContain(cloneB);

    const questions = await asUser(questionsGet, A.owner);
    expect(questions.status).toBe(200);
    expect(questions.body.questions.length).toBeGreaterThan(0);
    expect(questions.body.questions.every((x: any) => x.target_clone_id === cloneA)).toBe(true);

    const health = await asUser(teamHealthGet, A.owner);
    expect(health.status).toBe(200);
    const healthText = JSON.stringify(health.body);
    expect(healthText).toContain(cloneA);
    expect(healthText).not.toContain(cloneB);

    const members = await asUser(membersGet, A.owner);
    expect(members.status).toBe(200);
    const memberIds = members.body.members.map((m: any) => m.user_id);
    expect(memberIds).toEqual(expect.arrayContaining([A.owner.userId, memberA.userId]));
    expect(memberIds).not.toContain(B.owner.userId);
  });

  it('removed member loses access', async () => {
    const before = await asUser(clonesGet, memberA);
    expect(before.status).toBe(200);
    expect(before.body.clones.length).toBeGreaterThan(0);
    await q(`SELECT bureau.remove_member($1, $2, $3)`, [A.id, memberA.userId, A.owner.userId]);
    for (const h of [clonesGet, questionsGet, membersGet, teamHealthGet, streamsGet]) {
      const r = await asUser(h, memberA);
      expect(r.status).toBe(403);
      expect(r.body.error).toBe('No workspace found');
    }
  });

  it('no session -> 401', async () => {
    expect((await asUser(clonesGet, null)).status).toBe(401);
  });
});

describe('/api/slack/events', () => {
  it('signature checks', async () => {
    const p = mention(`Ebad${uid()}`, teamA, `<@UBOT> ask ${handleA} hi`);
    expect((await slack(p, { sig: 'v0=' + '0'.repeat(64) })).status).toBe(401);
    expect((await slack(p, { sig: 'v0=short' })).status).toBe(401);
    expect((await slack(p, { ts: String(Math.floor(Date.now() / 1000) - 600) })).status).toBe(401);
    expect((await slack(p, { ts: '' })).status).toBe(401);
    expect((await slack(p, { ts: 'abc' })).status).toBe(401);
    expect(await eventStored(p.event_id)).toBe(0);
  });

  it('url_verification echoes the challenge', async () => {
    const r = await slack({ type: 'url_verification', challenge: 'chal-123' });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ challenge: 'chal-123' });
  });

  it('valid mention -> exactly 1 question and a threaded postMessage', async () => {
    slackCalls.length = 0;
    const before = await slackQuestions(cloneA);
    const id = `Eok${uid()}`;
    const r = await slack(mention(id, teamA, `<@UBOT> ask ${handleA} what is blocking you?`));
    expect(r.status).toBe(200);
    expect((await slackQuestions(cloneA)) - before).toBe(1);
    expect(slackCalls.length).toBe(1);
    expect(slackCalls[0].url).toBe('https://slack.com/api/chat.postMessage');
    expect(slackCalls[0].body).toMatchObject({ channel: 'C0TEST', thread_ts: '1795500000.000100' });
    expect(slackCalls[0].body.text).toContain('Ship onboarding'); // from Clone A's latest heartbeat
  });

  it('duplicate event_id -> 0 new questions', async () => {
    const id = `Edup${uid()}`;
    await slack(mention(id, teamA, `<@UBOT> ask ${handleA} first`));
    const mid = await slackQuestions(cloneA);
    const r = await slack(mention(id, teamA, `<@UBOT> ask ${handleA} first`));
    expect(r.status).toBe(200);
    expect(await slackQuestions(cloneA)).toBe(mid);
  });

  it('retry header -> ignored, 0 new questions', async () => {
    const before = await slackQuestions(cloneA);
    const r = await slack(mention(`Eretry${uid()}`, teamA, `<@UBOT> ask ${handleA} retry`), { retry: '1' });
    expect(r.status).toBe(200);
    expect(await slackQuestions(cloneA)).toBe(before);
  });

  it('team A cannot reach a workspace B handle; unmapped team does nothing', async () => {
    slackCalls.length = 0;
    const before = await slackQuestions(cloneB);
    expect((await slack(mention(`Ex${uid()}`, teamA, `<@UBOT> ask ${handleB} leak?`))).status).toBe(200);
    expect((await slack(mention(`Eu${uid()}`, `TNOPE${uid()}`, `<@UBOT> ask ${handleA} hi`))).status).toBe(200);
    expect(await slackQuestions(cloneB)).toBe(before);
    expect(slackCalls.length).toBe(0);
  });

  it('processing failure frees the event_id so Slack can retry', async () => {
    const id = `Efail${uid()}`;
    await q(`REVOKE EXECUTE ON FUNCTION bureau.ask_question(uuid, text, uuid, text, text, uuid, uuid, bureau.question_source) FROM bureau_app`);
    try {
      const r = await slack(mention(id, teamA, `<@UBOT> ask ${handleA} will fail`));
      expect(r.status).toBe(500);
    } finally {
      await q(`GRANT EXECUTE ON FUNCTION bureau.ask_question(uuid, text, uuid, text, text, uuid, uuid, bureau.question_source) TO bureau_app`);
    }
    expect(await eventStored(id)).toBe(0);
  });
});

describe('Slack definer functions', () => {
  it('are not executable by PUBLIC/anon and pin search_path to bureau, pg_temp', async () => {
    const rows = await q(`SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
        has_function_privilege('bureau_app', p.oid, 'EXECUTE') AS app, array_to_string(p.proconfig, ';') AS cfg
      FROM pg_proc p WHERE p.pronamespace = 'bureau'::regnamespace AND p.proname IN ('slack_resolve_team', 'slack_find_clone') ORDER BY 1`);
    expect(rows).toEqual([
      { proname: 'slack_find_clone', anon: false, app: true, cfg: 'search_path=bureau, pg_temp' },
      { proname: 'slack_resolve_team', anon: false, app: true, cfg: 'search_path=bureau, pg_temp' },
    ]);
  });

  it('slack_find_clone is scoped to the given workspace', async () => {
    expect(await q(`SELECT * FROM bureau.slack_find_clone($1, $2)`, [A.id, handleB])).toEqual([]);
    expect((await q(`SELECT id FROM bureau.slack_find_clone($1, $2)`, [B.id, handleB]))[0].id).toBe(cloneB);
  });
});
