/**
 * One-click connect (PR #6): DCR against the real oauth_clients schema, AS metadata,
 * auto-clone on code exchange / device approval (incl. 2 bots for one person and a
 * cross-person handle collision), optional clone_id on MCP tools, default scopes,
 * and a /connect render. App code runs as bureau_app; seeding uses the admin pool.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import { admin, q, cleanup, createWorkspace, createUser, addMember, uid } from './helpers/clone-fixtures';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

const CLAUDE_CB = 'https://claude.ai/api/mcp/auth_callback';
const dcrClients: string[] = [];
let register: any, metadata: any, mcpPost: any, deviceRoute: any;
let oauth: typeof import('../lib/oauth-server');
let grants: typeof import('../lib/oauth-grants');

beforeAll(async () => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://bureau-krustbuild.vercel.app';
  ({ POST: register } = await import('../app/api/oauth/register/route'));
  ({ GET: metadata } = await import('../app/.well-known/oauth-authorization-server/route'));
  ({ POST: mcpPost } = await import('../app/api/mcp/route'));
  ({ POST: deviceRoute } = await import('../app/api/oauth/device/route'));
  oauth = await import('../lib/oauth-server');
  grants = await import('../lib/oauth-grants');
});
afterAll(async () => {
  if (dcrClients.length) await q(`DELETE FROM bureau.oauth_clients WHERE client_id = ANY($1)`, [dcrClients]);
  await cleanup();
  await admin.end();
});

function dcr(body: any) {
  return register(new NextRequest('https://bureau-krustbuild.vercel.app/api/oauth/register', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));
}
async function registerClient(redirect: string, name = 'Claude'): Promise<string> {
  const res = await dcr({ client_name: name, redirect_uris: [redirect] });
  expect(res.status).toBe(201);
  const d = await res.json();
  dcrClients.push(d.client_id);
  return d.client_id;
}

/** Full authorization-code flow through the real lib functions (PKCE S256). */
async function connectViaCode(opts: { workspaceId: string; userId: string; clientId: string; redirect: string; label: string; scopes?: string[] }) {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const code = await oauth.storeAuthCode({
    userId: opts.userId, workspaceId: opts.workspaceId, clientId: opts.clientId, redirectUri: opts.redirect,
    codeChallenge: challenge, resource: null, scopes: opts.scopes ?? ['ingest:write', 'clone:write', 'questions:read', 'questions:write'],
    agentLabel: opts.label, streamIds: [], allowCreateStreams: true,
  });
  return oauth.exchangeCode(code, verifier, opts.clientId, opts.redirect, null);
}

async function linkForToken(token: string) {
  const [r] = await q<{ agent_link_id: string }>(
    `SELECT agent_link_id FROM bureau.oauth_tokens WHERE token_hash = encode(extensions.digest($1,'sha256'),'hex')`, [token]);
  return r.agent_link_id;
}
const clonesFor = (workspaceId: string) =>
  q<{ id: string; handle: string; vendor: string; owner_user_id: string; agent_link_id: string; display_name: string; protocol: string }>(
    `SELECT id, handle, vendor::text, owner_user_id, agent_link_id, display_name, protocol::text FROM bureau.digital_clones WHERE workspace_id = $1 ORDER BY created_at, handle`, [workspaceId]);

const mcp = (token: string, name: string, args: any = {}) =>
  mcpPost(new NextRequest('https://bureau-krustbuild.vercel.app/api/mcp', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  })).then((r: Response) => r.json());

describe('DCR (POST /api/oauth/register) against the real oauth_clients columns', () => {
  it('registers a public Claude client with only real columns', async () => {
    const res = await dcr({ client_name: 'Claude', redirect_uris: [CLAUDE_CB] });
    expect(res.status).toBe(201);
    const d = await res.json();
    dcrClients.push(d.client_id);
    expect(d.client_id).toMatch(/^dcr_[0-9a-f]{32}$/);
    expect(d.client_secret).toBeUndefined();
    expect(d.token_endpoint_auth_method).toBe('none');
    expect(d.scope).toBe('ingest:write clone:write questions:read questions:write');
    const [row] = await q(`SELECT client_name, redirect_uris, registration, vendor, verified, created_by, metadata FROM bureau.oauth_clients WHERE client_id = $1`, [d.client_id]);
    expect(row).toEqual({ client_name: 'Claude', redirect_uris: [CLAUDE_CB], registration: 'dcr', vendor: 'other', verified: false, created_by: null, metadata: {} });
  });

  it('accepts Cursor/Grok Bot cursor://anysphere.cursor-mcp callback and loopback; infers vendor by hostname', async () => {
    const res = await dcr({ client_name: 'Cursor', redirect_uris: ['cursor://anysphere.cursor-mcp/oauth/callback', 'http://127.0.0.1:8787/callback'] });
    expect(res.status).toBe(201);
    const d = await res.json(); dcrClients.push(d.client_id);
    const [row] = await q(`SELECT vendor FROM bureau.oauth_clients WHERE client_id = $1`, [d.client_id]);
    expect(row.vendor).toBe('cursor');
    const g = await dcr({ client_name: 'Grok', redirect_uris: ['https://grok.com/connectors-oauth-exchange-code/'] });
    const gd = await g.json(); dcrClients.push(gd.client_id);
    expect((await q(`SELECT vendor FROM bureau.oauth_clients WHERE client_id = $1`, [gd.client_id]))[0].vendor).toBe('grokbot');
  });

  it.each([
    ['other cursor:// hosts', ['cursor://evil/oauth/callback']],
    ['plain http to a remote host', ['http://evil.example/cb']],
    ['custom schemes', ['myapp://cb']],
    ['javascript:', ['javascript:alert(1)']],
    ['too many redirect_uris', Array.from({ length: 11 }, (_, i) => `https://x${i}.example/cb`)],
  ])('rejects %s', async (_n, uris) => {
    expect((await dcr({ client_name: 'x', redirect_uris: uris })).status).toBe(400);
  });

  it('does not infer vendor from a substring in the path', async () => {
    const res = await dcr({ client_name: 'Sneaky', redirect_uris: ['https://evil.example/chatgpt.com/cb'] });
    const d = await res.json(); dcrClients.push(d.client_id);
    expect((await q(`SELECT vendor FROM bureau.oauth_clients WHERE client_id = $1`, [d.client_id]))[0].vendor).toBe('other');
  });
});

describe('AS metadata', () => {
  it('advertises iss on authorization responses and S256/none, not CIMD (CIMD clients cannot be stored yet)', async () => {
    const d = await (await metadata()).json();
    expect(d.issuer).toBe('https://bureau-krustbuild.vercel.app');
    expect(d.authorization_response_iss_parameter_supported).toBe(true);
    expect(d.client_id_metadata_document_supported).not.toBe(true);
    expect(d.code_challenge_methods_supported).toEqual(['S256']);
    expect(d.token_endpoint_auth_methods_supported).toEqual(['none']);
    expect(d.registration_endpoint).toBe('https://bureau-krustbuild.vercel.app/api/oauth/register');
  });
});

describe('auto-clone on connect', () => {
  it('Claude via DCR: code exchange succeeds and creates an anthropic clone bound to the agent link', async () => {
    const ws = await createWorkspace('auto1');
    const clientId = await registerClient(CLAUDE_CB);
    const t = await connectViaCode({ workspaceId: ws.id, userId: ws.owner.userId, clientId, redirect: CLAUDE_CB, label: "Travis's Claude" });
    expect(t.accessToken).toMatch(/^bureau_at_/);
    const link = await linkForToken(t.accessToken);
    const clones = await clonesFor(ws.id);
    expect(clones).toHaveLength(1);
    expect(clones[0]).toMatchObject({ handle: 'travis-claude', vendor: 'anthropic', owner_user_id: ws.owner.userId, agent_link_id: link, display_name: "Travis's Claude", protocol: 'v1' });
  });

  it('same person, 2 bots with the same label: 2 clones, each keeps its own link', async () => {
    const ws = await createWorkspace('auto2');
    const c1 = await registerClient(CLAUDE_CB);
    const c2 = await registerClient('https://chatgpt.com/connector_platform_oauth_redirect', 'ChatGPT');
    const t1 = await connectViaCode({ workspaceId: ws.id, userId: ws.owner.userId, clientId: c1, redirect: CLAUDE_CB, label: 'My Bot' });
    const t2 = await connectViaCode({ workspaceId: ws.id, userId: ws.owner.userId, clientId: c2, redirect: 'https://chatgpt.com/connector_platform_oauth_redirect', label: 'My Bot' });
    const [l1, l2] = [await linkForToken(t1.accessToken), await linkForToken(t2.accessToken)];
    expect(l1).not.toBe(l2);
    const clones = await clonesFor(ws.id);
    expect(clones.map(c => c.handle).sort()).toEqual(['my-bot', 'my-bot-2']);
    expect(clones.find(c => c.handle === 'my-bot')!.agent_link_id).toBe(l1);
    expect(clones.find(c => c.handle === 'my-bot-2')!.agent_link_id).toBe(l2);
    expect(clones.find(c => c.handle === 'my-bot-2')!.vendor).toBe('openai');
  });

  it('handle collision with another person: suffixed, no error, other clone untouched', async () => {
    const ws = await createWorkspace('auto3');
    const bob = await createUser('bob'); await addMember(ws.id, bob);
    const c = await registerClient(CLAUDE_CB);
    const tA = await connectViaCode({ workspaceId: ws.id, userId: ws.owner.userId, clientId: c, redirect: CLAUDE_CB, label: 'Claude' });
    const tB = await connectViaCode({ workspaceId: ws.id, userId: bob.userId, clientId: c, redirect: CLAUDE_CB, label: 'Claude' });
    const clones = await clonesFor(ws.id);
    expect(clones).toHaveLength(2);
    const a = clones.find(x => x.owner_user_id === ws.owner.userId)!;
    const b = clones.find(x => x.owner_user_id === bob.userId)!;
    expect(a.handle).toBe('claude');
    expect(a.agent_link_id).toBe(await linkForToken(tA.accessToken));
    expect(b.handle).toBe('claude-2');
    expect(b.agent_link_id).toBe(await linkForToken(tB.accessToken));
  });

  it('re-connecting the same bot (same grant + label) reuses its clone', async () => {
    const ws = await createWorkspace('auto4');
    const c = await registerClient(CLAUDE_CB);
    await connectViaCode({ workspaceId: ws.id, userId: ws.owner.userId, clientId: c, redirect: CLAUDE_CB, label: 'Claude' });
    await connectViaCode({ workspaceId: ws.id, userId: ws.owner.userId, clientId: c, redirect: CLAUDE_CB, label: 'Claude' });
    expect(await clonesFor(ws.id)).toHaveLength(1);
  });

  it('a label with no usable characters still gets a valid handle', async () => {
    const ws = await createWorkspace('auto5');
    const c = await registerClient(CLAUDE_CB);
    await connectViaCode({ workspaceId: ws.id, userId: ws.owner.userId, clientId: c, redirect: CLAUDE_CB, label: '我的助手' });
    const [clone] = await clonesFor(ws.id);
    expect(clone.handle).toMatch(/^[a-z0-9-]+$/);
  });

  it('device flow: approve -> poll mints tokens and creates a custom clone (no default label crash)', async () => {
    const ws = await createWorkspace('auto6');
    const start = await oauth.startDeviceFlow('Smoke Bot A', ['ingest:write', 'clone:write']);
    expect(await grants.approveDeviceCode(start.userCode, ws.owner.userId, ws.id, 'Smoke Bot A', [], true)).toBe(true);
    const r = await oauth.pollDeviceCode(start.deviceCode);
    expect(r.status).toBe('approved');
    const clones = await clonesFor(ws.id);
    expect(clones).toHaveLength(1);
    expect(clones[0]).toMatchObject({ handle: 'smoke-bot-a', vendor: 'custom', agent_link_id: await linkForToken(r.accessToken!) });
    // second bot, same person, same label -> its own clone
    const s2 = await oauth.startDeviceFlow('Smoke Bot A', ['clone:write']);
    await grants.approveDeviceCode(s2.userCode, ws.owner.userId, ws.id, 'Smoke Bot B', [], true);
    const r2 = await oauth.pollDeviceCode(s2.deviceCode);
    expect(r2.status).toBe('approved');
    expect((await clonesFor(ws.id)).map(c => c.handle).sort()).toEqual(['smoke-bot-a', 'smoke-bot-b']);
  });
});

describe('optional clone_id on MCP tools', () => {
  it('heartbeat and profile resolve the clone from the token\'s agent link; another link cannot be used', async () => {
    const ws = await createWorkspace('mcp-opt');
    const c = await registerClient(CLAUDE_CB);
    const t = await connectViaCode({ workspaceId: ws.id, userId: ws.owner.userId, clientId: c, redirect: CLAUDE_CB, label: 'Claude' });
    const hb = await mcp(t.accessToken, 'bureau_post_heartbeat', { date: '2026-11-24', top_priority: 'Ship one-click connect' });
    expect(hb.error).toBeUndefined();
    const [clone] = await clonesFor(ws.id);
    const beats = await q(`SELECT top_priority FROM bureau.clone_heartbeats WHERE clone_id = $1`, [clone.id]);
    expect(beats.map((b: any) => b.top_priority)).toEqual(['Ship one-click connect']);
    const prof = await mcp(t.accessToken, 'bureau_update_profile', { responsibilities: 'Onboarding' });
    expect(prof.error).toBeUndefined();

    // A second workspace's token must not be able to post as this clone
    const other = await createWorkspace('mcp-opt-other');
    const c2 = await registerClient(CLAUDE_CB);
    const t2 = await connectViaCode({ workspaceId: other.id, userId: other.owner.userId, clientId: c2, redirect: CLAUDE_CB, label: 'Claude' });
    const cross = await mcp(t2.accessToken, 'bureau_post_heartbeat', { clone_id: clone.id, date: '2026-11-24', top_priority: 'x' });
    expect(cross.error).toBeDefined();
  });

  it('tool schemas no longer require clone_id and read tools carry readOnlyHint', async () => {
    const ws = await createWorkspace('mcp-list');
    const c = await registerClient(CLAUDE_CB);
    const t = await connectViaCode({ workspaceId: ws.id, userId: ws.owner.userId, clientId: c, redirect: CLAUDE_CB, label: 'Claude' });
    const res = await mcpPost(new NextRequest('https://bureau-krustbuild.vercel.app/api/mcp', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t.accessToken}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    }));
    const tools = (await res.json()).result.tools as any[];
    const by = (n: string) => tools.find(x => x.name === n);
    expect(by('bureau_post_heartbeat').inputSchema.required).toEqual(['date', 'top_priority']);
    expect(by('bureau_update_profile').inputSchema.required ?? []).not.toContain('clone_id');
    for (const n of ['bureau_whoami', 'bureau_list_streams', 'bureau_get_questions', 'bureau_team_health']) {
      expect(by(n).annotations?.readOnlyHint).toBe(true);
    }
    expect(by('bureau_post_heartbeat').annotations?.readOnlyHint).not.toBe(true);
  });
});

describe('default scopes', () => {
  it('resolveScopes: none requested -> employee set; explicit kept; team:read not added by default', async () => {
    const { resolveScopes, DEFAULT_SCOPES } = await import('../lib/oauth-scopes');
    expect(DEFAULT_SCOPES).toEqual(['ingest:write', 'clone:write', 'questions:read', 'questions:write']);
    expect(resolveScopes(undefined)).toEqual(DEFAULT_SCOPES);
    expect(resolveScopes(null)).toEqual(DEFAULT_SCOPES);
    expect(resolveScopes('')).toEqual(DEFAULT_SCOPES);
    expect(resolveScopes([])).toEqual(DEFAULT_SCOPES);
    expect(resolveScopes('ingest:write')).toEqual(['ingest:write']);
    expect(resolveScopes(['clone:write', 'team:read'])).toEqual(['clone:write', 'team:read']);
  });

  it('device endpoint without scope stores the default set', async () => {
    const res = await deviceRoute(new NextRequest('https://bureau-krustbuild.vercel.app/api/oauth/device', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: `Bot ${uid()}` }),
    }));
    expect(res.status).toBe(200);
    const d = await res.json();
    const [row] = await q(`SELECT scopes FROM bureau.oauth_device_codes WHERE user_code = $1`, [d.user_code]);
    expect(row.scopes).toEqual(['ingest:write', 'clone:write', 'questions:read', 'questions:write']);
    await q(`DELETE FROM bureau.oauth_device_codes WHERE user_code = $1`, [d.user_code]);
  });
});

describe('/connect page render', () => {
  it('renders the Claude prefill link, ChatGPT plugins button and Grok Bot copy button (no codes, no curl)', async () => {
    const React = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { default: ConnectPage } = await import('../app/connect/page');
    const html = renderToString(React.createElement(ConnectPage));
    expect(html).toContain('https://claude.ai/customize/connectors?modal=add-custom-connector&amp;connectorName=Bureau&amp;connectorUrl=https%3A%2F%2Fbureau-krustbuild.vercel.app%2Fmcp');
    expect(html).toContain('Connect Claude');
    expect(html).toContain('Open ChatGPT');
    expect(html).toContain('Copy');
    expect(html).not.toMatch(/curl|BURE-/);
  });
});

describe('redirect checks and helpers', () => {
  it('authorize accepts the registered cursor://anysphere.cursor-mcp callback (Grok Bot/Cursor) and http loopback only', () => {
    const cb = 'cursor://anysphere.cursor-mcp/oauth/callback';
    expect(oauth.validateRedirectUri(cb, [cb])).toBe(true);
    expect(oauth.validateRedirectUri('cursor://evil/cb', ['cursor://evil/cb'])).toBe(false);
    expect(oauth.validateRedirectUri('http://127.0.0.1:8787/cb', ['http://127.0.0.1:8787/cb'])).toBe(true);
    expect(oauth.validateRedirectUri('ftp://localhost/cb', ['ftp://localhost/cb'])).toBe(false);
    expect(oauth.validateRedirectUri(CLAUDE_CB, ['https://claude.ai/other'])).toBe(false);
  });

  it('client lookup reports whether redirect_uri is registered (consent page refuses to redirect otherwise)', async () => {
    const { GET } = await import('../app/api/oauth/client/route');
    const clientId = await registerClient(CLAUDE_CB);
    const get = (r: string) => GET(new NextRequest(`https://bureau-krustbuild.vercel.app/api/oauth/client?client_id=${clientId}&redirect_uri=${encodeURIComponent(r)}`)).then((x: Response) => x.json());
    expect((await get(CLAUDE_CB)).redirect_uri_allowed).toBe(true);
    expect((await get('https://evil.example/cb')).redirect_uri_allowed).toBe(false);
  });

  it('helpers: names, handles, vendors', async () => {
    const { firstNameFromEmail, defaultAgentLabel } = await import('../lib/display-name');
    const { slugHandle, cloneVendorFor } = await import('../lib/auto-clone');
    expect(firstNameFromEmail('travis.wu.bmc@gmail.com')).toBe('Travis');
    expect(firstNameFromEmail('')).toBe('');
    expect(defaultAgentLabel('Travis', 'Claude')).toBe("Travis's Claude");
    expect(defaultAgentLabel('', null)).toBe('AI agent');
    expect(slugHandle("Travis's Claude")).toBe('travis-claude');
    expect(slugHandle('José’s Grok Bot!')).toBe('jose-grok-bot');
    expect(slugHandle('')).toBe('agent');
    expect(slugHandle('x'.repeat(80))).toHaveLength(40);
    expect(cloneVendorFor('other', CLAUDE_CB)).toBe('anthropic');
    expect(cloneVendorFor('openai', 'https://chatgpt.com/connector_platform_oauth_redirect')).toBe('openai');
    expect(cloneVendorFor('cursor', 'cursor://anysphere.cursor-mcp/oauth/callback')).toBe('cursor');
    expect(cloneVendorFor('grokbot', 'https://grok.com/cb')).toBe('custom');
    expect(cloneVendorFor('other', 'https://evil.example/claude.ai')).toBe('custom');
  });

  it('get_questions works without clone_id', async () => {
    const ws = await createWorkspace('mcp-q');
    const c = await registerClient(CLAUDE_CB);
    const t = await connectViaCode({ workspaceId: ws.id, userId: ws.owner.userId, clientId: c, redirect: CLAUDE_CB, label: 'Claude' });
    const r = await mcp(t.accessToken, 'bureau_get_questions', {});
    expect(r.error).toBeUndefined();
    expect(JSON.parse(r.result.content[0].text)).toEqual([]);
  });
});
