/**
 * Ground-truth capture (Phase A) + management views (Phase B).
 * ALL DATA HERE IS SAMPLE DATA (fake people, repos, keys and payloads) labelled "SAMPLE".
 * App code runs as bureau_app (DATABASE_URL); seeding uses the admin pool. No network: fetch is
 * stubbed per test and any unexpected call throws.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createHmac, randomBytes } from 'crypto';
import {
  admin, q, cleanup, createWorkspace, createUser, addMember, createOAuthToken,
  type Member, type Workspace,
} from './helpers/clone-fixtures';
import { ACTIVITY_POLICY_VERSION } from '../lib/activity-policy';

let sessionUser: { id: string; email: string } | null = null;
let cookieJar: Record<string, string> = {};
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (n: string) => (cookieJar[n] ? { value: cookieJar[n] } : undefined), delete: () => undefined }) }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: sessionUser } }) } }),
}));
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.NEXT_PUBLIC_APP_URL = 'https://bureau.sample.invalid';
process.env.BUREAU_ACTIVITY_ENCRYPTION_KEY = randomBytes(32).toString('base64'); // throwaway, this run only
delete process.env.BUREAU_ENABLE_LLM_REVIEW;

type FetchFn = (url: string, init?: any) => Promise<any>;
const noNetwork: FetchFn = async (url) => { throw new Error(`Unexpected network call in test: ${String(url)}`); };
let fetchImpl: FetchFn = noNetwork;
vi.stubGlobal('fetch', (url: any, init?: any) => fetchImpl(String(url), init));
const jsonRes = (body: any, status = 200) => ({ ok: status < 400, status, json: async () => body });

const LEADER_SCOPES = ['ingest:write', 'clone:write', 'questions:read', 'questions:write', 'team:read', 'activity:read'];
const MEMBER_SCOPES = ['ingest:write', 'clone:write', 'questions:read', 'questions:write', 'team:read'];

let W: Workspace, ada: Member, jack: Member, jill: Member, kim: Member;
let W2: Workspace;
let routes: Record<string, any> = {};
let ownerTok: string, jackTok: string, jackForgedTok: string, adaTok: string;
let githubId: string, githubSecret: string;

const asUser = async (handler: any, user: Member | null, url: string, init: { method?: string; body?: any; headers?: Record<string, string> } = {}, ctx?: any) => {
  sessionUser = user ? { id: user.userId, email: user.email } : null;
  try {
    const method = init.method || (init.body === undefined ? 'GET' : 'POST');
    const res = await handler(new NextRequest(url, init.body === undefined ? { method, headers: init.headers } : {
      method, headers: { 'content-type': 'application/json', ...(init.headers || {}) }, body: JSON.stringify(init.body),
    }), ctx);
    const text = await res.text();
    let body: any = null; try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, body, res };
  } finally { sessionUser = null; }
};
const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) });
const accept = (ws: string, m: Member, version = ACTIVITY_POLICY_VERSION) =>
  q(`INSERT INTO bureau.activity_consents (workspace_id, user_id, policy_version, source, accepted_at)
     VALUES ($1, $2, $3, 'web', NOW() - INTERVAL '1 hour') ON CONFLICT (workspace_id, user_id, policy_version) DO UPDATE SET revoked_at = NULL`, [ws, m.userId, version]);
const unitsFor = (m: Member) => q(`SELECT * FROM bureau.work_events WHERE user_id = $1 ORDER BY created_at`, [m.userId]);
const mcp = async (token: string, name: string, args: any = {}) => {
  const res = await routes.mcp(new NextRequest('http://localhost/api/mcp', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  }));
  const body = await res.json();
  return { body, data: body.result ? JSON.parse(body.result.content[0].text) : undefined };
};
const hook = async (provider: string, id: string, raw: string, headers: Record<string, string>) => {
  const res = await routes.webhook(new NextRequest(`http://localhost/api/webhooks/${provider}/${id}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: raw,
  }), params({ provider, integrationId: id }));
  return { status: res.status, body: await res.json() };
};
const ghSign = (secret: string, raw: string) => 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
const now = () => new Date().toISOString();

beforeAll(async () => {
  routes.mcp = (await import('../app/api/mcp/route')).POST;
  routes.webhook = (await import('../app/api/webhooks/[provider]/[integrationId]/route')).POST;
  const integ = await import('../app/api/integrations/route');
  routes.integrationsGet = integ.GET; routes.integrationsPost = integ.POST;
  const one = await import('../app/api/integrations/[id]/route');
  routes.integrationPatch = one.PATCH; routes.integrationDelete = one.DELETE;
  routes.sync = (await import('../app/api/integrations/[id]/sync/route')).POST;
  routes.gStart = (await import('../app/api/integrations/google/start/route')).GET;
  routes.gCallback = (await import('../app/api/integrations/google/callback/route')).GET;
  const links = await import('../app/api/identity-links/route');
  routes.linksGet = links.GET; routes.linksPost = links.POST;
  routes.linkDelete = (await import('../app/api/identity-links/[id]/route')).DELETE;
  routes.work = (await import('../app/api/work/route')).GET;
  const w = await import('../app/api/work/[id]/route');
  routes.workPatch = w.PATCH; routes.workDelete = w.DELETE;
  routes.syncCron = (await import('../app/api/cron/ground-truth-sync/route')).GET;
  routes.retention = (await import('../app/api/cron/activity-retention/route')).GET;
  routes.activityPatch = (await import('../app/api/activity/[id]/route')).PATCH;

  // SAMPLE workspace: owner (W.owner), Ada (admin), Jack + Jill + Kim (members)
  W = await createWorkspace('gt-sample');
  ada = await createUser('ada-sample'); await addMember(W.id, ada, 'admin');
  jack = await createUser('jack-sample'); await addMember(W.id, jack, 'member');
  jill = await createUser('jill-sample'); await addMember(W.id, jill, 'member');
  kim = await createUser('kim-sample'); await addMember(W.id, kim, 'member');
  W2 = await createWorkspace('gt-sample-2');
  await accept(W.id, W.owner); await accept(W.id, ada); await accept(W.id, jack); await accept(W.id, kim);
  // Jill accepted only the OLD notice version: she must count as not accepted.
  await accept(W.id, jill, '2026-11-25');

  ownerTok = (await createOAuthToken({ workspaceId: W.id, userId: W.owner.userId, scopes: LEADER_SCOPES, label: 'owner-sample' })).token;
  adaTok = (await createOAuthToken({ workspaceId: W.id, userId: ada.userId, scopes: LEADER_SCOPES, label: 'ada-sample' })).token;
  const jt = await createOAuthToken({ workspaceId: W.id, userId: jack.userId, scopes: MEMBER_SCOPES, label: "Jack's Claude (SAMPLE)" });
  jackTok = jt.token;
  jackForgedTok = (await createOAuthToken({ workspaceId: W.id, userId: jack.userId, scopes: LEADER_SCOPES, label: 'jack-forged' })).token;
  await q(`INSERT INTO bureau.digital_clones (workspace_id, owner_user_id, agent_link_id, display_name, handle, vendor, last_seen_at)
           VALUES ($1, $2, $3, 'Jack Sample', 'jack-sample', 'anthropic', NOW())`, [W.id, jack.userId, jt.agentLinkId]);
});
afterAll(async () => {
  await cleanup();
  await admin.end();
});

describe('signature verification', () => {
  it('GitHub matches the documented test vector and rejects tampering', async () => {
    const { verifyGithub } = await import('../lib/ground-truth/verify');
    const secret = "It's a Secret to Everybody";
    const sig = 'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17';
    expect(verifyGithub(secret, 'Hello, World!', sig)).toBe(true);
    expect(verifyGithub(secret, 'Hello, World?', sig)).toBe(false);
    expect(verifyGithub('other', 'Hello, World!', sig)).toBe(false);
    expect(verifyGithub(secret, 'Hello, World!', sig.slice(7))).toBe(false); // missing prefix
    expect(verifyGithub(secret, 'Hello, World!', null)).toBe(false);
  });

  it('Vercel (sha1), Linear and Sentry (sha256) are hex HMACs of the raw body', async () => {
    const { verifyVercel, verifyLinear, verifySentry } = await import('../lib/ground-truth/verify');
    const body = '{"SAMPLE":true}';
    const s1 = createHmac('sha1', 'sample-secret').update(body).digest('hex');
    const s256 = createHmac('sha256', 'sample-secret').update(body).digest('hex');
    expect(verifyVercel('sample-secret', body, s1)).toBe(true);
    expect(verifyVercel('sample-secret', body, s256)).toBe(false);
    expect(verifyLinear('sample-secret', body, s256)).toBe(true);
    expect(verifySentry('sample-secret', body, s256.toUpperCase())).toBe(true);
    expect(verifySentry('sample-secret', body + ' ', s256)).toBe(false);
    expect(verifyLinear('sample-secret', body, 'zz' + s256.slice(2))).toBe(false);
  });
});

describe('rule-based classifier (no LLM)', () => {
  it('classifies task type, project and stuck signals deterministically', async () => {
    const c = await import('../lib/ground-truth/classify');
    expect(c.classifyTaskType('fix the failing migration', 'claude')).toBe('debug');
    expect(c.classifyTaskType('render 4 seedance keyframes for the opener', 'claude')).toBe('generate_media');
    expect(c.classifyTaskType('tighten spacing on the figma frames', 'claude')).toBe('design');
    expect(c.classifyTaskType('implement the board endpoint', 'claude')).toBe('build');
    expect(c.classifyTaskType('hello', 'higgsfield')).toBe('generate_media');
    expect(c.classifyTaskType('hello', 'chatgpt')).toBe('other');
    expect(c.resolveProject({ hints: ['SampleOrg/duckduckgoose-web'] })).toBe('duckduckgoose');
    expect(c.resolveProject({ hints: ['sampleorg/api'], projectMap: { 'sampleorg/api': 'Bureau' } })).toBe('bureau');
    expect(c.resolveProject({ text: 'peak glow up shot list' })).toBe('studio-peak-glow-up');
    expect(c.resolveProject({ text: 'nothing known' })).toBe('unassigned');
    expect(c.resolveProject({ explicit: 'DDG' })).toBe('duckduckgoose');
    expect(c.detectStuck('the character still drifting after 5 tries')).toBe('stuck_keyword');
    expect(c.detectStuck('ship it')).toBeNull();
    expect(c.disciplineFor('generate_media', 'claude')).toBe('studio');
    expect(c.disciplineFor('build', 'github')).toBe('engineering');
  });
});

describe('adapters (pure parsing)', () => {
  it('GitHub: distinct commits only; merged PR -> shipped; self-review ignored', async () => {
    const { parseGithub } = await import('../lib/ground-truth/adapters/github');
    const push = parseGithub('push', 'd1', { repository: { full_name: 'sampleorg/bureau', name: 'bureau' }, ref: 'refs/heads/main', commits: [
      { id: 'a1', distinct: true, message: 'SAMPLE: add board\n\nbody', timestamp: now(), url: 'https://github.com/sampleorg/bureau/commit/a1', author: { username: 'jack-gh', email: 'jack@sample.invalid' } },
      { id: 'a2', distinct: false, message: 'dup', timestamp: now(), author: { username: 'jack-gh' } },
    ] });
    expect(push).toHaveLength(1);
    expect(push[0].title).toBe('SAMPLE: add board');
    const merged = parseGithub('pull_request', 'd2', { action: 'closed', repository: { full_name: 'sampleorg/bureau' }, pull_request: { number: 7, title: 'SAMPLE PR', merged: true, merged_at: now(), html_url: 'https://github.com/sampleorg/bureau/pull/7', user: { login: 'jack-gh' } } });
    expect(merged[0].status).toBe('shipped');
    const selfReview = parseGithub('pull_request_review', 'd3', { action: 'submitted', repository: {}, review: { id: 1, user: { login: 'jack-gh' } }, pull_request: { number: 7, user: { login: 'jack-gh' } } });
    expect(selfReview).toHaveLength(0);
    expect(parseGithub('ping', 'd4', { zen: 'SAMPLE' })).toHaveLength(0);
  });

  it('Vercel, Linear, Sentry map documented events to status', async () => {
    const { parseVercel } = await import('../lib/ground-truth/adapters/vercel');
    const { parseLinear } = await import('../lib/ground-truth/adapters/linear');
    const { parseSentry } = await import('../lib/ground-truth/adapters/sentry');
    const v = (type: string, target: string) => parseVercel({ type, id: 'evt', createdAt: Date.now(), payload: { user: { id: 'vu1' }, target, deployment: { id: 'dpl_1', name: 'bureau', url: 'bureau-x.vercel.app' }, project: { id: 'prj' } } });
    expect(v('deployment.succeeded', 'production')[0].status).toBe('shipped');
    expect(v('deployment.succeeded', 'preview')[0].status).toBe('in_progress');
    expect(v('deployment.error', 'production')[0]).toMatchObject({ status: 'blocked', blocker: 'deploy_failed', failed: true });
    expect(v('project.created', 'production')).toHaveLength(0);
    expect(parseLinear('del', { type: 'Issue', action: 'update', updatedFrom: { title: 'x' }, data: { id: 'i' } })).toHaveLength(0);
    expect(parseLinear('del', { type: 'Issue', action: 'update', updatedFrom: { stateId: 's' }, data: { id: 'i', title: 'SAMPLE', state: { type: 'completed' } }, actor: { id: 'u' } })[0].status).toBe('shipped');
    expect(parseLinear('del', { type: 'Comment', action: 'create', data: {} })).toHaveLength(0);
    expect(parseSentry('issue', 'r1', { action: 'created', data: { issue: { id: '1' } } })).toHaveLength(0);
    expect(parseSentry('installation', 'r1', { action: 'assigned', data: { issue: { id: '1' } } })).toHaveLength(0);
    expect(parseSentry('issue', 'r1', { action: 'resolved', actor: { type: 'user', id: '9' }, data: { issue: { id: '1', title: 'SAMPLE' } } })[0].status).toBe('shipped');
  });

  it('sync adapters keep metadata only and skip non-final Higgsfield rows', async () => {
    const { elevenlabsItemToSignal } = await import('../lib/ground-truth/adapters/elevenlabs');
    const { higgsfieldRowToSignal } = await import('../lib/ground-truth/adapters/higgsfield');
    const { driveActivityToSignal } = await import('../lib/ground-truth/adapters/google-drive');
    const e = elevenlabsItemToSignal({ history_item_id: 'h1', date_unix: 1764000000, character_count_change_from: 100, character_count_change_to: 340, voice_name: 'Sample Voice', source: 'TTS', text: 'SAMPLE narration for Ember' })!;
    expect(e.title).toBe('ElevenLabs TTS - Sample Voice (240 chars)');
    expect(e.title).not.toContain('narration');
    expect(e.effort).toEqual({ generations: 1, chars: 240 });
    expect(higgsfieldRowToSignal({ id: 'g', type: 'generation', state: 'running' })).toBeNull();
    expect(higgsfieldRowToSignal({ id: 'c', type: 'charge', state: 'succeeded' })).toBeNull();
    expect(higgsfieldRowToSignal({ id: 'g2', type: 'generation', state: 'failed', credits: '2.5', created_at: now() })!.failed).toBe(true);
    expect(driveActivityToSignal({ primaryActionDetail: { edit: {} }, actors: [{ user: { knownUser: { isCurrentUser: false } } }], targets: [{ driveItem: { name: 'items/abcdef', title: 'x' } }], timestamp: now() })).toBeNull();
    expect(driveActivityToSignal({ primaryActionDetail: { edit: {} }, actors: [{ user: { knownUser: { isCurrentUser: true } } }], targets: [{ driveItem: { name: 'items/abcdef', title: 'SAMPLE script', mimeType: 'application/vnd.google-apps.document' } }], timestamp: now() })!.taskType).toBe('copy');
  });
});

describe('integrations + identity links', () => {
  it('only leaders connect workspace sources; GitHub secret is shown once and stored encrypted', async () => {
    const denied = await asUser(routes.integrationsPost, jack, 'http://localhost/api/integrations', { body: { provider: 'github', label: 'SAMPLE' } });
    expect(denied.status).toBe(403);
    const r = await asUser(routes.integrationsPost, W.owner, 'http://localhost/api/integrations', { body: { provider: 'github', label: 'SAMPLE org', config: { project_map: { 'sampleorg/api': 'bureau' } } } });
    expect(r.status).toBe(201);
    githubId = r.body.integration.id;
    githubSecret = r.body.signing_secret;
    expect(githubSecret).toMatch(/^[0-9a-f]{64}$/);
    expect(r.body.integration.webhook_url).toBe(`https://bureau.sample.invalid/api/webhooks/github/${githubId}`);
    const [row] = await q(`SELECT secret_enc FROM bureau.integrations WHERE id = $1`, [githubId]);
    expect(row.secret_enc.startsWith('v1:')).toBe(true);
    expect(row.secret_enc).not.toContain(githubSecret);
    const list = await asUser(routes.integrationsGet, W.owner, 'http://localhost/api/integrations');
    expect(JSON.stringify(list.body)).not.toContain(githubSecret);
    expect(JSON.stringify(list.body)).not.toContain('secret_enc');
    const memberList = await asUser(routes.integrationsGet, jack, 'http://localhost/api/integrations');
    expect(memberList.body.integrations).toHaveLength(0);
    const bad = await asUser(routes.integrationsPost, W.owner, 'http://localhost/api/integrations', { body: { provider: 'linear' } });
    expect(bad.status).toBe(400);
  });

  it('members link only themselves; leaders can link anyone; duplicates rejected', async () => {
    const self = await asUser(routes.linksPost, jack, 'http://localhost/api/identity-links', { body: { provider: 'github', external_id: '@Jack-GH' } });
    expect(self.status).toBe(201);
    const other = await asUser(routes.linksPost, jack, 'http://localhost/api/identity-links', { body: { provider: 'github', external_id: 'kim-gh', user_id: kim.userId } });
    expect(other.status).toBe(403);
    const lead = await asUser(routes.linksPost, W.owner, 'http://localhost/api/identity-links', { body: { provider: 'github', external_id: 'jill-gh', user_id: jill.userId } });
    expect(lead.status).toBe(201);
    const dup = await asUser(routes.linksPost, kim, 'http://localhost/api/identity-links', { body: { provider: 'github', external_id: 'jack-gh' } });
    expect(dup.status).toBe(400);
    const [l] = await q(`SELECT external_id FROM bureau.identity_links WHERE user_id = $1`, [jack.userId]);
    expect(l.external_id).toBe('jack-gh');
    const mine = await asUser(routes.linksGet, jack, 'http://localhost/api/identity-links');
    expect(mine.body.links.every((x: any) => x.user_id === jack.userId)).toBe(true);
  });
});

describe('webhooks end to end', () => {
  const push = (login: string, sha: string, msg: string, repo = 'sampleorg/duckduckgoose') => JSON.stringify({
    ref: 'refs/heads/main', repository: { full_name: repo, name: repo.split('/')[1] },
    commits: [{ id: sha, distinct: true, message: msg, timestamp: now(), url: `https://github.com/${repo}/commit/${sha}`, author: { username: login, email: `${login}@users.noreply.sample.invalid` } }],
  });

  it('rejects bad signatures and unknown integrations without storing anything', async () => {
    const raw = push('jack-gh', 'bad1', 'SAMPLE should not land');
    const r = await hook('github', githubId, raw, { 'x-github-event': 'push', 'x-github-delivery': 'x1', 'x-hub-signature-256': ghSign('wrong', raw) });
    expect(r.status).toBe(401);
    const unknown = await hook('github', '00000000-0000-4000-8000-000000000000', raw, { 'x-hub-signature-256': ghSign(githubSecret, raw) });
    expect(unknown.status).toBe(404);
    const wrongProvider = await hook('vercel', githubId, raw, { 'x-vercel-signature': 'ab' });
    expect(wrongProvider.status).toBe(404);
    expect(await unitsFor(jack)).toHaveLength(0);
  });

  it('a signed push lands as an encrypted, verified work unit for the linked person; redelivery is a no-op', async () => {
    const raw = push('jack-gh', 'c0ffee1', 'SAMPLE fix duck spawn crash');
    const headers = { 'x-github-event': 'push', 'x-github-delivery': 'del-1', 'x-hub-signature-256': ghSign(githubSecret, raw) };
    const r = await hook('github', githubId, raw, headers);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ received: 1, recorded: 1, dropped: 0 });
    const again = await hook('github', githubId, raw, headers);
    expect(again.body).toMatchObject({ recorded: 0, duplicate: 1 });
    const units = await unitsFor(jack);
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ project: 'duckduckgoose', task_type: 'debug', confidence: 'verified_artifact', discipline: 'engineering' });
    expect(units[0].title_enc).not.toContain('duck');
    const [src] = await q(`SELECT external_key FROM bureau.work_event_sources WHERE work_event_id = $1`, [units[0].id]);
    expect(src.external_key).toMatch(/^[0-9a-f]{64}$/);
    const [integ] = await q(`SELECT last_event_at FROM bureau.integrations WHERE id = $1`, [githubId]);
    expect(integ.last_event_at).not.toBeNull();
  });

  it('drops events from people who have not accepted the CURRENT notice, or are unknown', async () => {
    const raw = JSON.stringify({ repository: { full_name: 'sampleorg/x' }, commits: [
      { id: 'j1', distinct: true, message: 'SAMPLE jill commit', timestamp: now(), author: { username: 'jill-gh' } },
      { id: 'u1', distinct: true, message: 'SAMPLE stranger', timestamp: now(), author: { username: 'nobody-gh', email: 'nobody@sample.invalid' } },
    ] });
    const r = await hook('github', githubId, raw, { 'x-github-event': 'push', 'x-github-delivery': 'del-2', 'x-hub-signature-256': ghSign(githubSecret, raw) });
    expect(r.body).toMatchObject({ received: 2, recorded: 0, dropped: 2 });
    expect(await unitsFor(jill)).toHaveLength(0);
  });

  it('drops anything that happened before the person accepted the notice', async () => {
    const raw = JSON.stringify({ repository: { full_name: 'sampleorg/x' }, commits: [
      { id: 'old1', distinct: true, message: 'SAMPLE old work', timestamp: new Date(Date.now() - 3 * 3600_000).toISOString(), author: { username: 'jack-gh' } },
    ] });
    const r = await hook('github', githubId, raw, { 'x-github-event': 'push', 'x-github-delivery': 'del-3', 'x-hub-signature-256': ghSign(githubSecret, raw) });
    expect(r.body).toMatchObject({ received: 1, recorded: 0, dropped: 1 });
  });

  it('PR opened then merged stitches into one unit that ends shipped', async () => {
    const pr = (action: string, extra: any) => JSON.stringify({ action, repository: { full_name: 'sampleorg/api', name: 'api' }, pull_request: { number: 42, title: 'SAMPLE add work board', html_url: 'https://github.com/sampleorg/api/pull/42', user: { login: 'jack-gh' }, head: { ref: 'feat/board' }, created_at: now(), updated_at: now(), ...extra } });
    const o = pr('opened', {});
    await hook('github', githubId, o, { 'x-github-event': 'pull_request', 'x-github-delivery': 'pr-1', 'x-hub-signature-256': ghSign(githubSecret, o) });
    const m = pr('closed', { merged: true, merged_at: now() });
    await hook('github', githubId, m, { 'x-github-event': 'pull_request', 'x-github-delivery': 'pr-2', 'x-hub-signature-256': ghSign(githubSecret, m) });
    const units = (await unitsFor(jack)).filter(u => u.artifact_link === 'https://github.com/sampleorg/api/pull/42');
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ status: 'shipped', project: 'bureau', signal_count: 2 });
    expect(units[0].effort.prs_merged).toBe(1);
  });

  it('Vercel deploy errors become blocked units (actor via GitHub login fallback)', async () => {
    const r = await asUser(routes.integrationsPost, W.owner, 'http://localhost/api/integrations', { body: { provider: 'vercel', secret: 'sample-vercel-secret-123' } });
    expect(r.status).toBe(201);
    expect(r.body.signing_secret).toBeUndefined();
    const id = r.body.integration.id;
    const raw = JSON.stringify({ type: 'deployment.error', id: 'evt_1', createdAt: Date.now(), payload: { user: { id: 'unlinked-vercel-user' }, target: 'production', deployment: { id: 'dpl_s1', name: 'ember-site', url: 'ember-site-s1.vercel.app', meta: { githubCommitAuthorLogin: 'jack-gh', githubCommitMessage: 'SAMPLE bump' } }, links: { deployment: 'https://vercel.com/sample/ember-site/dpl_s1' }, project: { id: 'prj_s' } } });
    const sig = createHmac('sha1', 'sample-vercel-secret-123').update(raw).digest('hex');
    const res = await hook('vercel', id, raw, { 'x-vercel-signature': sig });
    expect(res.body).toMatchObject({ recorded: 1 });
    const u = (await unitsFor(jack)).find(x => x.project === 'ember');
    expect(u).toMatchObject({ status: 'blocked', blocker_code: 'deploy_failed', tool: 'vercel' });
  });

  it('Linear: stale deliveries rejected; assignee resolved by member email', async () => {
    const r = await asUser(routes.integrationsPost, W.owner, 'http://localhost/api/integrations', { body: { provider: 'linear', secret: 'sample-linear-secret' } });
    const id = r.body.integration.id;
    const body = (ts: number) => JSON.stringify({ action: 'update', type: 'Issue', webhookTimestamp: ts, url: 'https://linear.app/sample/issue/SAM-1', updatedFrom: { stateId: 'old' },
      actor: { id: 'lu-owner', type: 'user', email: W.owner.email }, data: { id: 'iss1', identifier: 'SAM-1', title: 'SAMPLE glow up shot list', state: { name: 'In Progress', type: 'started' }, assignee: { id: 'lu-kim', email: kim.email } } });
    const stale = body(Date.now() - 5 * 60_000);
    const s = await hook('linear', id, stale, { 'linear-signature': createHmac('sha256', 'sample-linear-secret').update(stale).digest('hex'), 'linear-delivery': 'ld-0' });
    expect(s.status).toBe(401);
    const fresh = body(Date.now());
    const f = await hook('linear', id, fresh, { 'linear-signature': createHmac('sha256', 'sample-linear-secret').update(fresh).digest('hex'), 'linear-delivery': 'ld-1' });
    expect(f.body).toMatchObject({ recorded: 1 });
    const [u] = await unitsFor(kim);
    expect(u).toMatchObject({ project: 'studio-peak-glow-up', status: 'in_progress', tool: 'linear' });
  });

  it('Sentry: assigned issue -> debug unit for the assignee', async () => {
    const r = await asUser(routes.integrationsPost, W.owner, 'http://localhost/api/integrations', { body: { provider: 'sentry', secret: 'sample-sentry-client-secret' } });
    const id = r.body.integration.id;
    await q(`INSERT INTO bureau.identity_links (workspace_id, user_id, provider, external_id) VALUES ($1, $2, 'sentry', '5501')`, [W.id, ada.userId]);
    const raw = JSON.stringify({ action: 'assigned', actor: { type: 'user', id: '1', name: 'SAMPLE' }, data: { issue: { id: '777', shortId: 'BUREAU-9', title: 'SAMPLE TypeError in board', web_url: 'https://sentry.io/organizations/sample/issues/777/', project: { slug: 'bureau' }, assignedTo: { type: 'user', id: '5501' } } } });
    const res = await hook('sentry', id, raw, { 'sentry-hook-resource': 'issue', 'request-id': 'rq-1', 'sentry-hook-signature': createHmac('sha256', 'sample-sentry-client-secret').update(raw).digest('hex') });
    expect(res.body).toMatchObject({ recorded: 1 });
    const [u] = await unitsFor(ada);
    expect(u).toMatchObject({ project: 'bureau', task_type: 'debug', tool: 'sentry' });
  });

  it('paused integrations stop accepting deliveries', async () => {
    const p = await asUser(routes.integrationPatch, W.owner, `http://localhost/api/integrations/${githubId}`, { method: 'PATCH', body: { status: 'paused' } }, params({ id: githubId }));
    expect(p.body.integration.status).toBe('paused');
    const raw = push('jack-gh', 'pz1', 'SAMPLE paused');
    const r = await hook('github', githubId, raw, { 'x-github-event': 'push', 'x-hub-signature-256': ghSign(githubSecret, raw) });
    expect(r.status).toBe(404);
    await asUser(routes.integrationPatch, W.owner, `http://localhost/api/integrations/${githubId}`, { method: 'PATCH', body: { status: 'active' } }, params({ id: githubId }));
  });
});

describe('AI requests feed the stitcher', () => {
  it('a logged prompt + a later commit on the same project become one correlated unit; personal never feeds', async () => {
    const log = await mcp(jackTok, 'bureau_log_activity', { request: 'SAMPLE plan the ember bedtime landing copy outline', project: 'ember' });
    expect(log.data.status).toBe('logged');
    expect(log.data.work_event_id).toBeTruthy();
    const [unit] = await q(`SELECT * FROM bureau.work_events WHERE id = $1`, [log.data.work_event_id]);
    expect(unit).toMatchObject({ confidence: 'self_reported', tool: 'claude', project: 'ember' });
    expect(unit.effort.prompts).toBe(1);
    const raw = JSON.stringify({ repository: { full_name: 'sampleorg/bedtimewithember', name: 'bedtimewithember' }, commits: [
      { id: 'em1', distinct: true, message: 'SAMPLE landing tweaks', timestamp: now(), url: 'https://github.com/sampleorg/bedtimewithember/commit/em1', author: { username: 'jack-gh' } },
    ] });
    await hook('github', githubId, raw, { 'x-github-event': 'push', 'x-github-delivery': 'em-1', 'x-hub-signature-256': ghSign(githubSecret, raw) });
    const [after] = await q(`SELECT * FROM bureau.work_events WHERE id = $1`, [log.data.work_event_id]);
    expect(after.confidence).toBe('correlated');
    expect(after.tools).toEqual(expect.arrayContaining(['claude', 'github']));
    expect(after.source_kinds).toEqual(expect.arrayContaining(['agent_mcp', 'webhook_truth']));

    const before = (await unitsFor(jack)).length;
    const personal = await mcp(jackTok, 'bureau_log_activity', { request: 'personal', personal: true });
    expect(personal.data.status).toBe('logged');
    expect(personal.data.work_event_id).toBeUndefined();
    expect((await unitsFor(jack)).length).toBe(before);
  });

  it('three failing attempts in 30 minutes mark the unit blocked (retry loop)', async () => {
    for (let i = 0; i < 3; i++) {
      await mcp(jackTok, 'bureau_log_activity', { request: `SAMPLE the duckduckgoose build is failing again attempt ${i}`, project: 'duckduckgoose' });
    }
    const u = (await unitsFor(jack)).find(x => x.project === 'duckduckgoose' && x.blocker_code === 'retry_loop');
    expect(u?.status).toBe('blocked');
  });

  it('hiding an AI log entry detaches its signal from the unit', async () => {
    const log = await mcp(jackTok, 'bureau_log_activity', { request: 'SAMPLE research typography options for bureau', project: 'bureau' });
    const id = log.data.id;
    const hidden = await asUser(routes.activityPatch, jack, `http://localhost/api/activity/${id}`, { method: 'PATCH', body: { hidden: true } }, params({ id }));
    expect(hidden.status).toBe(200);
    expect(await q(`SELECT 1 FROM bureau.work_event_sources WHERE activity_log_id = $1`, [id])).toHaveLength(0);
  });
});

describe('management views + RLS', () => {
  it('leaders get the board; members only ever see themselves', async () => {
    const lead = await asUser(routes.work, ada, 'http://localhost/api/work?view=board&days=7');
    expect(lead.body.view).toBe('board');
    const emails = lead.body.board.people.map((p: any) => p.email);
    expect(emails).toEqual(expect.arrayContaining([jack.email, kim.email, jill.email]));
    expect(lead.body.board.people.find((p: any) => p.email === jill.email).consent_accepted).toBe(false);
    expect(lead.body.board.totals.units).toBeGreaterThanOrEqual(5);
    expect(lead.body.board.blocked.length).toBeGreaterThanOrEqual(1);
    const member = await asUser(routes.work, kim, 'http://localhost/api/work?view=board');
    expect(member.body.view).toBe('mine');
    expect(member.body.units.every((u: any) => u.user_id === kim.userId)).toBe(true);
    const sneaky = await asUser(routes.work, kim, `http://localhost/api/work?view=timeline&user_id=${jack.userId}`);
    expect(sneaky.body.units.every((u: any) => u.user_id === kim.userId)).toBe(true);
    const db = await import('../lib/db');
    const raw = await db.withUser(kim.userId, kim.email, async (c: any) => (await c.query(`SELECT user_id FROM bureau.work_events WHERE user_id = $1`, [jack.userId])).rows);
    expect(raw).toHaveLength(0);
    const tl = await asUser(routes.work, W.owner, `http://localhost/api/work?view=timeline&user_id=${jack.userId}`);
    expect(tl.body.units.length).toBeGreaterThanOrEqual(3);
    expect(tl.body.units[0].title).toBeTruthy();
  });

  it('digest lists shipped/blocked work and coverage gaps', async () => {
    const d = await asUser(routes.work, W.owner, 'http://localhost/api/work?view=digest&period=weekly');
    expect(d.body.digest.counts.shipped).toBeGreaterThanOrEqual(1);
    expect(d.body.digest.coverage.not_accepted.map((x: any) => x.email)).toContain(jill.email);
    expect(d.body.digest.lines[0]).toMatch(/^Last 7 days: \d+ shipped/);
  });

  it('a person can hide (content erased for good) or delete their own unit, never someone else\'s', async () => {
    const [u] = await unitsFor(kim);
    const notMine = await asUser(routes.workPatch, jack, `http://localhost/api/work/${u.id}`, { method: 'PATCH', body: { hidden: true } }, params({ id: u.id }));
    expect(notMine.status).toBe(404);
    const leaderTry = await asUser(routes.workDelete, W.owner, `http://localhost/api/work/${u.id}`, { method: 'DELETE' }, params({ id: u.id }));
    expect(leaderTry.status).toBe(404);
    const ok = await asUser(routes.workPatch, kim, `http://localhost/api/work/${u.id}`, { method: 'PATCH', body: { hidden: true } }, params({ id: u.id }));
    expect(ok.status).toBe(200);
    const [row] = await q(`SELECT * FROM bureau.work_events WHERE id = $1`, [u.id]);
    expect(row.title_enc).toBeNull(); expect(row.artifact_link).toBeNull();
    await expect(q(`UPDATE bureau.work_events SET hidden_at = NULL WHERE id = $1`, [u.id])).rejects.toThrow(/hidden unit/);
    const view = await asUser(routes.work, W.owner, `http://localhost/api/work?view=timeline&user_id=${kim.userId}`);
    expect(view.body.units[0]).toMatchObject({ hidden: true, title: null });
    const del = await asUser(routes.workDelete, kim, `http://localhost/api/work/${u.id}`, { method: 'DELETE' }, params({ id: u.id }));
    expect(del.status).toBe(200);
    expect(await unitsFor(kim)).toHaveLength(0);
  });

  it('MCP work tools: owners/admins only, with a live role check', async () => {
    const board = await mcp(adaTok, 'bureau_work_board', { days: 7 });
    expect(board.data.status).toBe('ok');
    expect(board.data.totals.units).toBeGreaterThanOrEqual(1);
    const tl = await mcp(ownerTok, 'bureau_work_timeline', { who: 'jack-sample' });
    expect(tl.data.status).toBe('ok');
    expect(tl.data.units.length).toBeGreaterThanOrEqual(1);
    const digest = await mcp(ownerTok, 'bureau_work_digest', { period: 'daily' });
    expect(digest.data.counts).toBeDefined();
    const forged = await mcp(jackForgedTok, 'bureau_work_board', {});
    expect(forged.body.error.message).toMatch(/owners and admins/);
    const noScope = await mcp(jackTok, 'bureau_work_digest', {});
    expect(noScope.body.error.message).toMatch(/activity:read/);
  });
});

describe('scheduled syncs (stubbed vendor APIs)', () => {
  it('ElevenLabs personal key: only the owner, only with consent, metadata only', async () => {
    const r = await asUser(routes.integrationsPost, kim, 'http://localhost/api/integrations', { body: { provider: 'elevenlabs', credential: 'sk_SAMPLE_elevenlabs_key_0000' } });
    expect(r.status).toBe(201);
    expect(r.body.integration.personal).toBe(true);
    const id = r.body.integration.id;
    const seen: string[] = [];
    fetchImpl = async (url, init) => {
      seen.push(url);
      expect(url.startsWith('https://api.elevenlabs.io/v1/history?')).toBe(true);
      expect(init.headers['xi-api-key']).toBe('sk_SAMPLE_elevenlabs_key_0000');
      return jsonRes({ history: [{ history_item_id: 'hs1', date_unix: Math.floor(Date.now() / 1000), character_count_change_from: 0, character_count_change_to: 500, voice_name: 'Sample Narrator', source: 'TTS', text: 'SAMPLE ember chapter one' }], has_more: false, last_history_item_id: 'hs1' });
    };
    try {
      const other = await asUser(routes.sync, jack, `http://localhost/api/integrations/${id}/sync`, { method: 'POST' }, params({ id }));
      expect(other.status).toBe(404);
      const s = await asUser(routes.sync, kim, `http://localhost/api/integrations/${id}/sync`, { method: 'POST' }, params({ id }));
      expect(s.body).toMatchObject({ ok: true, summary: { recorded: 1 } });
    } finally { fetchImpl = noNetwork; }
    expect(seen).toHaveLength(1);
    const [u] = await unitsFor(kim);
    expect(u).toMatchObject({ project: 'ember', task_type: 'generate_media', status: 'rendered', discipline: 'studio' });
    expect(Number(u.effort.chars)).toBe(500);
    const [integ] = await q(`SELECT sync_cursor, last_sync_at FROM bureau.integrations WHERE id = $1`, [id]);
    expect(integ.last_sync_at).not.toBeNull();
    expect(Number(integ.sync_cursor)).toBeGreaterThan(0);
  });

  it('Higgsfield org usage report: attributes by member email, drops unknown actors, records failures', async () => {
    const r = await asUser(routes.integrationsPost, W.owner, 'http://localhost/api/integrations', { body: { provider: 'higgsfield', credential: 'hf_SAMPLE_org_usage_key' } });
    const id = r.body.integration.id;
    const at = new Date().toISOString();
    fetchImpl = async (url, init) => {
      expect(url.startsWith('https://fnf-api-gw.higgsfield.ai/fnf/v1/organization/generation_usage_report?')).toBe(true);
      expect(init.headers['x-api-key']).toBe('hf_SAMPLE_org_usage_key');
      expect(new URL(url).searchParams.get('starting_at')).toBeTruthy();
      return jsonRes({ data: [
        { id: 'hg1', type: 'generation', created_at: at, completed_at: at, state: 'succeeded', credits: '12.5', model_name: 'Seedance SAMPLE', output_type: 'video', actor: { user_id: 'hfu1', email_address: jack.email }, projects: [{ id: 'p', name: 'Peak Glow Up' }] },
        { id: 'hg2', type: 'generation', created_at: at, state: 'running', actor: { email_address: jack.email } },
        { id: 'hg3', type: 'generation', created_at: at, failed_at: at, state: 'failed', credits: '0', actor: { email_address: 'outsider@sample.invalid' } },
      ], has_more: false, next_page: null });
    };
    try {
      const { runSync } = await import('../lib/ground-truth/ingest');
      const [res] = await runSync(id);
      expect(res).toMatchObject({ ok: true, summary: { received: 2, recorded: 1, dropped: 1 } });
    } finally { fetchImpl = noNetwork; }
    const u = (await unitsFor(jack)).find(x => x.tool === 'higgsfield');
    expect(u).toMatchObject({ project: 'studio-peak-glow-up', status: 'rendered' });
    expect(Number(u.effort.credits)).toBe(12.5);
  });

  it('Google Drive: OAuth callback stores only an encrypted refresh token; sync keeps my edits only', async () => {
    process.env.GOOGLE_CLIENT_ID = 'sample-client.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'sample-google-secret';
    try {
      const start = await asUser(routes.gStart, ada, 'http://localhost/api/integrations/google/start');
      expect(start.status).toBe(307);
      const loc = new URL(start.res.headers.get('location'));
      expect(loc.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.activity.readonly');
      const state = loc.searchParams.get('state')!;
      const mismatch = await asUser(routes.gCallback, ada, `http://localhost/api/integrations/google/callback?code=c&state=${state}`, { headers: { cookie: 'bureau_gdrive_state=nope' } });
      expect(mismatch.res.headers.get('location')).toContain('drive=state_mismatch');
      fetchImpl = async (url) => {
        if (url === 'https://oauth2.googleapis.com/token') return jsonRes({ access_token: 'ya29.SAMPLE', refresh_token: '1//SAMPLE-refresh' });
        if (url === 'https://driveactivity.googleapis.com/v2/activity:query') return jsonRes({ activities: [
          { primaryActionDetail: { edit: {} }, actors: [{ user: { knownUser: { isCurrentUser: true } } }], targets: [{ driveItem: { name: 'items/SAMPLEdoc123', title: 'SAMPLE Bureau launch brief', mimeType: 'application/vnd.google-apps.document' } }], timestamp: new Date().toISOString() },
          { primaryActionDetail: { edit: {} }, actors: [{ user: { knownUser: { isCurrentUser: false } } }], targets: [{ driveItem: { name: 'items/SAMPLEdoc999', title: 'someone else', mimeType: 'application/pdf' } }], timestamp: new Date().toISOString() },
        ] });
        throw new Error(`Unexpected network call in test: ${url}`);
      };
      const cb = await asUser(routes.gCallback, ada, `http://localhost/api/integrations/google/callback?code=c&state=${state}`, { headers: { cookie: `bureau_gdrive_state=${state}` } });
      expect(cb.res.headers.get('location')).toContain('drive=connected');
      const [integ] = await q(`SELECT * FROM bureau.integrations WHERE provider = 'google_drive' AND owner_user_id = $1`, [ada.userId]);
      expect(integ.credential_enc).not.toContain('SAMPLE-refresh');
      const { runSync } = await import('../lib/ground-truth/ingest');
      const [res] = await runSync(integ.id);
      expect(res).toMatchObject({ ok: true, summary: { recorded: 1 } });
    } finally {
      fetchImpl = noNetwork;
      delete process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_SECRET;
    }
    const u = (await unitsFor(ada)).find(x => x.tool === 'drive');
    expect(u).toMatchObject({ project: 'bureau', task_type: 'copy', artifact_link: 'https://drive.google.com/open?id=SAMPLEdoc123' });
  });

  it('vendor errors are recorded on the integration, not thrown; cron requires CRON_SECRET', async () => {
    fetchImpl = async () => jsonRes({ detail: 'unauthorized' }, 401);
    const saved = process.env.CRON_SECRET;
    try {
      const unauth = await routes.syncCron(new NextRequest('http://localhost/api/cron/ground-truth-sync', { headers: { authorization: 'Bearer nope' } }));
      expect(unauth.status).toBe(401);
      process.env.CRON_SECRET = randomBytes(24).toString('hex');
      const ok = await routes.syncCron(new NextRequest('http://localhost/api/cron/ground-truth-sync', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
      expect(ok.status).toBe(200);
      const body = await ok.json();
      expect(body.integrations).toBeGreaterThanOrEqual(2);
      expect(body.results.some((x: any) => x.ok === false)).toBe(true);
    } finally {
      fetchImpl = noNetwork;
      if (saved === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saved;
    }
    const errs = await q(`SELECT last_error FROM bureau.integrations WHERE workspace_id = $1 AND provider IN ('elevenlabs','higgsfield')`, [W.id]);
    expect(errs.every(e => /returned 401/.test(e.last_error))).toBe(true);
  });
});

describe('consent, retention and database guards', () => {
  it('RLS refuses work units for someone without the current notice, even via direct SQL as bureau_app', async () => {
    const db = await import('../lib/db');
    await expect(db.withUser(jill.userId, jill.email, (c: any) => c.query(
      `INSERT INTO bureau.work_events (workspace_id, user_id, project, task_type, tool, tools, status, confidence, title_enc, started_at, last_seen_at, expires_at)
       VALUES ($1, $2, 'bureau', 'build', 'github', ARRAY['github'], 'in_progress', 'self_reported', 'v1:a:b:c', NOW(), NOW(), NOW() + INTERVAL '30 days')`,
      [W.id, jill.userId]
    ))).rejects.toThrow(/row-level security/);
    // Revoking consent stops capture immediately.
    await q(`UPDATE bureau.activity_consents SET revoked_at = NOW() WHERE workspace_id = $1 AND user_id = $2`, [W.id, kim.userId]);
    const { runSync } = await import('../lib/ground-truth/ingest');
    const [integ] = await q(`SELECT id FROM bureau.integrations WHERE provider = 'elevenlabs' AND owner_user_id = $1`, [kim.userId]);
    fetchImpl = async () => jsonRes({ history: [{ history_item_id: 'hs2', date_unix: Math.floor(Date.now() / 1000), character_count_change_from: 0, character_count_change_to: 10, source: 'TTS' }], has_more: false });
    try {
      const [res] = await runSync(integ.id);
      expect(res.summary).toMatchObject({ received: 1, recorded: 0, dropped: 1 });
    } finally { fetchImpl = noNetwork; }
  });

  it('retention: units expire after 30 days (never more than 90) and the daily job purges them', async () => {
    const [u] = await unitsFor(jack);
    expect(new Date(u.expires_at).getTime() - Date.now()).toBeLessThanOrEqual(30 * 86400_000 + 60_000);
    await q(`ALTER TABLE bureau.work_events DISABLE TRIGGER work_events_guard_update`);
    try { await q(`UPDATE bureau.work_events SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [u.id]); }
    finally { await q(`ALTER TABLE bureau.work_events ENABLE TRIGGER work_events_guard_update`); }
    const saved = process.env.CRON_SECRET;
    try {
      process.env.CRON_SECRET = randomBytes(24).toString('hex');
      const res = await routes.retention(new NextRequest('http://localhost/api/cron/activity-retention', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
      expect((await res.json()).work_units_deleted).toBeGreaterThanOrEqual(1);
    } finally { if (saved === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saved; }
    expect(await q(`SELECT 1 FROM bureau.work_events WHERE id = $1`, [u.id])).toHaveLength(0);
    await expect(q(`INSERT INTO bureau.work_events (workspace_id, user_id, project, task_type, tool, tools, status, confidence, title_enc, started_at, last_seen_at, expires_at)
       VALUES ($1, $2, 'bureau', 'build', 'github', ARRAY['github'], 'in_progress', 'self_reported', 'v1:a:b:c', NOW(), NOW(), NOW() + INTERVAL '91 days')`, [W.id, jack.userId])).rejects.toThrow();
  });

  it('other workspaces see nothing; deleting an integration is leader-only', async () => {
    const w2 = await asUser(routes.work, W2.owner, 'http://localhost/api/work?view=board');
    expect(w2.body.board.totals.units).toBe(0);
    const memberDel = await asUser(routes.integrationDelete, jack, `http://localhost/api/integrations/${githubId}`, { method: 'DELETE' }, params({ id: githubId }));
    expect(memberDel.status).toBe(404);
    const del = await asUser(routes.integrationDelete, W.owner, `http://localhost/api/integrations/${githubId}`, { method: 'DELETE' }, params({ id: githubId }));
    expect(del.status).toBe(200);
  });

  it('bureau_app still has no auth schema usage, no role memberships and nothing on OAuth secrets tables', async () => {
    const [g] = await q(`SELECT has_schema_privilege('bureau_app', 'auth', 'USAGE') AS auth_usage,
      (SELECT count(*)::int FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member WHERE r.rolname = 'bureau_app') AS memberships,
      (SELECT count(*)::int FROM information_schema.role_table_grants WHERE grantee = 'bureau_app'
         AND table_name IN ('oauth_tokens', 'oauth_codes', 'oauth_device_codes')) AS oauth_grants`);
    expect(g).toEqual({ auth_usage: false, memberships: 0, oauth_grants: 0 });
  });

  it('no LLM review flag is involved', () => {
    expect(process.env.BUREAU_ENABLE_LLM_REVIEW).toBeUndefined();
  });
});
