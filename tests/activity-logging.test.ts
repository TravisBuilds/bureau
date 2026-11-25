/**
 * Passive activity logging (Phase 1): encryption, secret scrubbing, the BC PIPA notice gate,
 * owner/admin-only RLS (separate from team:read), personal-hide, retention, the MCP tools and
 * the web API. App code runs as bureau_app (DATABASE_URL); seeding uses the admin pool.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import {
  admin, q, cleanup, createWorkspace, createUser, addMember, createClient, createOAuthToken,
  type Member, type Workspace,
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
// A throwaway key for this run only (never the dev or production key).
const TEST_KEY = randomBytes(32).toString('base64');
process.env.BUREAU_ACTIVITY_ENCRYPTION_KEY = TEST_KEY;
vi.stubGlobal('fetch', async (url: any) => { throw new Error(`Unexpected network call in test: ${String(url)}`); });

const DEFAULT = ['ingest:write', 'clone:write', 'questions:read', 'questions:write'];
const MEMBER_SCOPES = [...DEFAULT, 'team:read'];
const LEADER_SCOPES = [...DEFAULT, 'team:read', 'activity:read'];

let mcpPost: any, authorizePost: any, tokenPost: any, devicePost: any, deviceApprovePost: any;
let activityGet: any, consentGet: any, consentPost: any, consentDelete: any, entryPatch: any, entryDelete: any, cronGet: any;
let db: typeof import('../lib/db');

// W1: Travis (owner), Ada (admin), Jack + Jill (members), Rex (removed admin)
let W1: Workspace, ada: Member, jack: Member, jill: Member, rex: Member;
// W2: another company with its own owner and member
let W2: Workspace, mia: Member;
let jackClone: string;
let ownerTok: string, ownerTokNoActivity: string, adaTok: string, jackTok: string, jackTokForged: string, jillTok: string, rexTok: string, w2OwnerTok: string, miaTok: string;

const mcpRaw = async (token: string, body: any) => {
  const res = await mcpPost(new NextRequest('http://localhost/api/mcp', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }));
  return res.json();
};
const mcp = async (token: string, name: string, args: any = {}) => {
  const body = await mcpRaw(token, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  return { body, data: body.result ? JSON.parse(body.result.content[0].text) : undefined };
};
const asUser = async (handler: any, user: Member | null, url: string, init: { method?: string; body?: any } = {}, ctx?: any) => {
  sessionUser = user ? { id: user.userId, email: user.email } : null;
  try {
    const method = init.method || (init.body === undefined ? 'GET' : 'POST');
    const res = await handler(new NextRequest(url, init.body === undefined ? { method } : {
      method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.body),
    }), ctx);
    return { status: res.status, body: await res.json() };
  } finally { sessionUser = null; }
};
const token = async (form: Record<string, string>) => {
  const res = await tokenPost(new NextRequest('http://localhost/api/oauth/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString(),
  }));
  return { status: res.status, body: await res.json() };
};
const consentRow = async (ws: string, user: Member) =>
  (await q(`SELECT * FROM bureau.activity_consents WHERE workspace_id = $1 AND user_id = $2`, [ws, user.userId]))[0];
const rowsFor = async (ws: string, user: Member) =>
  q(`SELECT * FROM bureau.activity_logs WHERE workspace_id = $1 AND user_id = $2 ORDER BY received_at`, [ws, user.userId]);
const accept = async (ws: string, user: Member) =>
  q(`INSERT INTO bureau.activity_consents (workspace_id, user_id, policy_version, source)
     VALUES ($1, $2, (SELECT '2026-11-25'), 'web') ON CONFLICT (workspace_id, user_id, policy_version) DO UPDATE SET revoked_at = NULL`, [ws, user.userId]);

async function consentConnect(user: Member, clientId: string, label: string, noticeAccepted: boolean | undefined) {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const c = await asUser(authorizePost, user, 'http://localhost/api/oauth/authorize', { body: {
    client_id: clientId, redirect_uri: 'http://localhost/cb', state: 's', code_challenge: challenge,
    agent_label: label, stream_ids: [], allow_create_streams: true, approved: true,
    ...(noticeAccepted === undefined ? {} : { activity_notice_accepted: noticeAccepted }),
  } });
  expect(c.status).toBe(200);
  const t = await token({ grant_type: 'authorization_code', code: c.body.code, code_verifier: verifier, client_id: clientId, redirect_uri: 'http://localhost/cb' });
  expect(t.status).toBe(200);
  return t.body.access_token as string;
}

beforeAll(async () => {
  ({ POST: mcpPost } = await import('../app/api/mcp/route'));
  ({ POST: authorizePost } = await import('../app/api/oauth/authorize/route'));
  ({ POST: tokenPost } = await import('../app/api/oauth/token/route'));
  ({ POST: devicePost } = await import('../app/api/oauth/device/route'));
  ({ POST: deviceApprovePost } = await import('../app/api/oauth/device/approve/route'));
  ({ GET: activityGet } = await import('../app/api/activity/route'));
  ({ GET: consentGet, POST: consentPost, DELETE: consentDelete } = await import('../app/api/activity/consent/route'));
  ({ PATCH: entryPatch, DELETE: entryDelete } = await import('../app/api/activity/[id]/route'));
  ({ GET: cronGet } = await import('../app/api/cron/activity-retention/route'));
  db = await import('../lib/db');

  W1 = await createWorkspace('act1');
  ada = await createUser('ada'); await addMember(W1.id, ada, 'admin');
  jack = await createUser('jack'); await addMember(W1.id, jack, 'member');
  jill = await createUser('jill'); await addMember(W1.id, jill, 'member');
  rex = await createUser('rex'); await addMember(W1.id, rex, 'admin');
  W2 = await createWorkspace('act2');
  mia = await createUser('mia'); await addMember(W2.id, mia, 'member');

  ownerTok = (await createOAuthToken({ workspaceId: W1.id, userId: W1.owner.userId, scopes: LEADER_SCOPES, label: 'travis-bot' })).token;
  ownerTokNoActivity = (await createOAuthToken({ workspaceId: W1.id, userId: W1.owner.userId, scopes: MEMBER_SCOPES, label: 'travis-old' })).token;
  adaTok = (await createOAuthToken({ workspaceId: W1.id, userId: ada.userId, scopes: LEADER_SCOPES, label: 'ada-bot' })).token;
  const jt = await createOAuthToken({ workspaceId: W1.id, userId: jack.userId, scopes: MEMBER_SCOPES, label: "Jack's Claude" });
  jackTok = jt.token;
  const [c] = await q<{ id: string }>(
    `INSERT INTO bureau.digital_clones (workspace_id, owner_user_id, agent_link_id, display_name, handle, vendor, last_seen_at)
     VALUES ($1, $2, $3, $4, 'jack-claude', 'anthropic', NOW()) RETURNING id`,
    [W1.id, jack.userId, jt.agentLinkId, "Jack's Claude"]
  );
  jackClone = c.id;
  await q(`INSERT INTO bureau.digital_clones (workspace_id, owner_user_id, display_name, handle, vendor) VALUES ($1, $2, $3, 'jill-grok', 'custom')`, [W1.id, jill.userId, "Jill's Grok"]);
  // A member token that somehow carries activity:read: the live role check must still deny.
  jackTokForged = (await createOAuthToken({ workspaceId: W1.id, userId: jack.userId, scopes: LEADER_SCOPES, label: 'jack-forged' })).token;
  jillTok = (await createOAuthToken({ workspaceId: W1.id, userId: jill.userId, scopes: MEMBER_SCOPES, label: 'jill-bot' })).token;
  rexTok = (await createOAuthToken({ workspaceId: W1.id, userId: rex.userId, scopes: LEADER_SCOPES, label: 'rex-bot' })).token;
  w2OwnerTok = (await createOAuthToken({ workspaceId: W2.id, userId: W2.owner.userId, scopes: LEADER_SCOPES, label: 'w2-bot' })).token;
  miaTok = (await createOAuthToken({ workspaceId: W2.id, userId: mia.userId, scopes: MEMBER_SCOPES, label: 'mia-bot' })).token;
});
afterAll(async () => {
  await cleanup();
  await admin.end();
});

describe('encryption (AES-256-GCM)', () => {
  it('round-trips, binds to workspace+user, and never stores plaintext', async () => {
    const { encryptActivity, decryptActivity } = await import('../lib/activity-crypto');
    const env = encryptActivity('Draft the Q4 pricing deck for Acme', 'ws-1', 'user-1');
    expect(env.startsWith('v1:')).toBe(true);
    expect(env).not.toContain('pricing');
    expect(decryptActivity(env, 'ws-1', 'user-1')).toBe('Draft the Q4 pricing deck for Acme');
    expect(() => decryptActivity(env, 'ws-1', 'user-2')).toThrow();
    expect(() => decryptActivity(env, 'ws-2', 'user-1')).toThrow();
    const tampered = env.slice(0, -4) + (env.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect(() => decryptActivity(tampered, 'ws-1', 'user-1')).toThrow();
    expect(encryptActivity('same', 'w', 'u')).not.toBe(encryptActivity('same', 'w', 'u')); // random IV
  });

  it('fails closed without a valid key (no fallback key)', async () => {
    const { encryptActivity, activityKeyConfigured, ActivityKeyError } = await import('../lib/activity-crypto');
    const saved = process.env.BUREAU_ACTIVITY_ENCRYPTION_KEY;
    try {
      delete process.env.BUREAU_ACTIVITY_ENCRYPTION_KEY;
      expect(activityKeyConfigured()).toBe(false);
      expect(() => encryptActivity('x', 'w', 'u')).toThrow(ActivityKeyError);
      process.env.BUREAU_ACTIVITY_ENCRYPTION_KEY = 'too-short';
      expect(activityKeyConfigured()).toBe(false);
      process.env.BUREAU_ACTIVITY_ENCRYPTION_KEY = randomBytes(32).toString('hex');
      expect(activityKeyConfigured()).toBe(true);
    } finally {
      process.env.BUREAU_ACTIVITY_ENCRYPTION_KEY = saved;
    }
  });
});

describe('secret scrubbing', () => {
  it('removes common credentials and card numbers, keeps ordinary text', async () => {
    const { scrubSecrets } = await import('../lib/activity-scrub');
    const fakeOpenAI = 'sk-proj-' + 'A'.repeat(30);
    const fakeSlack = 'xoxb-' + '1234567890-abcdefghij';
    const fakeGh = 'ghp_' + 'b'.repeat(36);
    const fakeAws = 'AKIA' + 'ABCDEFGHIJKLMNOP';
    const fakeJwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlLXZhbHVl';
    const input = [
      `use key ${fakeOpenAI} and ${fakeSlack}`,
      `token ${fakeGh} aws ${fakeAws}`,
      `jwt ${fakeJwt}`,
      'db postgresql://bureau_app:hunter2secret@db.example.com:5432/x',
      'password: CorrectHorse99',
      'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456',
      'card 4242 4242 4242 4242 but order 1234567890123',
      '-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAK\n-----END RSA PRIVATE KEY-----',
      'Please summarise the meeting with Acme about pricing',
    ].join('\n');
    const out = scrubSecrets(input);
    for (const s of [fakeOpenAI, fakeSlack, fakeGh, fakeAws, fakeJwt, 'hunter2secret', 'CorrectHorse99', 'abcdefghijklmnopqrstuvwxyz123456', '4242 4242 4242 4242', 'MIIBOgIBAAJBAK']) {
      expect(out.text).not.toContain(s);
    }
    expect(out.text).toContain('postgresql://bureau_app:[REDACTED:url_password]');
    expect(out.text).toContain('1234567890123'); // not Luhn-valid -> kept
    expect(out.text).toContain('Please summarise the meeting with Acme about pricing');
    expect(out.count).toBeGreaterThanOrEqual(10);
    expect(scrubSecrets('nothing secret here').count).toBe(0);
  });
});

describe('scopes: activity:read is owners/admins only (not team:read)', () => {
  it('scopesForRole', async () => {
    const { scopesForRole } = await import('../lib/oauth-scopes');
    expect(scopesForRole(DEFAULT, 'owner')).toContain('activity:read');
    expect(scopesForRole(DEFAULT, 'admin')).toContain('activity:read');
    expect(scopesForRole(DEFAULT, 'member')).not.toContain('activity:read');
    expect(scopesForRole([...DEFAULT, 'activity:read'], 'member')).not.toContain('activity:read');
    expect(scopesForRole(['activity:read'], null)).toEqual([]);
    expect(scopesForRole(['ingest:write'], 'owner')).toEqual(['ingest:write']);
  });
});

describe('database invariants', () => {
  it('bureau_app has no auth USAGE, no role membership, no grants on oauth secret tables; RLS is on', async () => {
    const [r] = await q(`SELECT has_schema_privilege('bureau_app','auth','USAGE') AS auth_usage,
      (SELECT count(*)::int FROM pg_auth_members WHERE member = 'bureau_app'::regrole) AS memberships,
      has_table_privilege('bureau_app','bureau.oauth_tokens','SELECT,INSERT,UPDATE,DELETE') AS t,
      has_table_privilege('bureau_app','bureau.oauth_codes','SELECT,INSERT,UPDATE,DELETE') AS c,
      has_table_privilege('bureau_app','bureau.oauth_device_codes','SELECT,INSERT,UPDATE,DELETE') AS d,
      (SELECT relrowsecurity FROM pg_class WHERE oid = 'bureau.activity_logs'::regclass) AS rls_logs,
      (SELECT relrowsecurity FROM pg_class WHERE oid = 'bureau.activity_consents'::regclass) AS rls_consents,
      has_table_privilege('bureau_app','bureau.activity_consents','DELETE') AS consent_delete`);
    expect(r).toEqual({ auth_usage: false, memberships: 0, t: false, c: false, d: false, rls_logs: true, rls_consents: true, consent_delete: false });
  });
});

describe('notice gate at connect (BC PIPA)', () => {
  it('consent page approval with the box ticked records an acknowledgement; without it, none', async () => {
    const c1 = await createClient();
    await consentConnect(jill, c1, 'Jill ChatGPT', undefined);
    expect(await consentRow(W1.id, jill)).toBeUndefined();
    await consentConnect(jill, await createClient(), 'Jill Claude', false);
    expect(await consentRow(W1.id, jill)).toBeUndefined();
    await consentConnect(jill, await createClient(), 'Jill Grok', true);
    const row = await consentRow(W1.id, jill);
    expect(row.source).toBe('oauth_consent');
    expect(row.policy_version).toBe('2026-11-25');
    expect(row.revoked_at).toBeNull();
  });

  it('device approval with activity_notice_accepted records it too', async () => {
    const start = await devicePost(new NextRequest('http://localhost/api/oauth/device', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'CLI' }),
    }));
    const d = await start.json();
    const ap = await asUser(deviceApprovePost, ada, 'http://localhost/api/oauth/device/approve',
      { body: { user_code: d.user_code, agent_label: 'ada-cli', stream_ids: [], allow_create_streams: false, activity_notice_accepted: true } });
    expect(ap.status).toBe(200);
    expect((await consentRow(W1.id, ada)).source).toBe('device_consent');
  });

  it('logging is refused (nothing stored) until the notice is accepted', async () => {
    const r = await mcp(jackTok, 'bureau_log_activity', { request: 'Write the onboarding doc' });
    expect(r.body.error).toBeUndefined();
    expect(r.data.status).toBe('consent_required');
    expect(r.data.message).toContain('/activity');
    expect(await rowsFor(W1.id, jack)).toHaveLength(0);
  });

  it('a user cannot insert rows directly without consent or for someone else (RLS)', async () => {
    await expect(db.withUser(jack.userId, jack.email, (cl) => cl.query(
      `INSERT INTO bureau.activity_logs (workspace_id, user_id, request_enc) VALUES ($1, $2, 'v1:x:y:z')`, [W1.id, jack.userId]
    ))).rejects.toThrow(/row-level security/);
    await accept(W1.id, jack);
    await expect(db.withUser(jack.userId, jack.email, (cl) => cl.query(
      `INSERT INTO bureau.activity_logs (workspace_id, user_id, request_enc) VALUES ($1, $2, 'v1:x:y:z')`, [W1.id, jill.userId]
    ))).rejects.toThrow(/row-level security/);
    await expect(db.withUser(mia.userId, mia.email, (cl) => cl.query(
      `INSERT INTO bureau.activity_consents (workspace_id, user_id, policy_version, source) VALUES ($1, $2, 'x', 'web')`, [W1.id, mia.userId]
    ))).rejects.toThrow(/row-level security/);
  });
});

describe('bureau_log_activity', () => {
  it('MCP initialize carries the standing logging instructions', async () => {
    const d = await mcpRaw(jackTok, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
    expect(d.result.instructions).toMatch(/EVERY message/);
    expect(d.result.instructions).toContain('bureau_log_activity');
  });

  it('logs an encrypted, secret-scrubbed entry linked to the clone', async () => {
    const fake = 'sk-proj-' + 'Z'.repeat(32);
    const r = await mcp(jackTok, 'bureau_log_activity', {
      request: `Build the Acme invoice report using key ${fake}`,
      detail: 'Created invoice-report.xlsx',
      conversation_ref: 'acme-thread',
    });
    expect(r.body.error).toBeUndefined();
    expect(r.data.status).toBe('logged');
    expect(r.data.secrets_removed).toBe(1);
    const [row] = await rowsFor(W1.id, jack);
    expect(row.clone_id).toBe(jackClone);
    expect(row.agent_label).toBe("Jack's Claude");
    expect(row.vendor).toBe('anthropic');
    expect(row.request_enc.startsWith('v1:')).toBe(true);
    expect(row.request_enc).not.toContain('Acme');
    expect(row.detail_enc).not.toContain('invoice');
    expect(row.request_enc).not.toContain(fake);
    expect(row.secrets_scrubbed).toBe(1);
    const days = (new Date(row.expires_at).getTime() - Date.now()) / 86400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });

  it('personal requests store only a stub', async () => {
    const r = await mcp(jackTok, 'bureau_log_activity', { request: 'my doctor appointment', personal: true });
    expect(r.data.status).toBe('logged');
    expect(r.data.personal).toBe(true);
    const rows = await rowsFor(W1.id, jack);
    const stub = rows.find((x: any) => x.id === r.data.id);
    expect(stub.hidden_at).not.toBeNull();
    expect(stub.request_enc).toBeNull();
    expect(stub.detail_enc).toBeNull();
  });

  it('validates input and refuses when the server has no key', async () => {
    expect((await mcp(jackTok, 'bureau_log_activity', { request: '   ' })).body.error.code).toBe(-32602);
    const saved = process.env.BUREAU_ACTIVITY_ENCRYPTION_KEY;
    try {
      delete process.env.BUREAU_ACTIVITY_ENCRYPTION_KEY;
      const r = await mcp(jackTok, 'bureau_log_activity', { request: 'anything' });
      expect(r.body.error.message).toMatch(/not configured/);
    } finally {
      process.env.BUREAU_ACTIVITY_ENCRYPTION_KEY = saved;
    }
  });

  it('a revoked acknowledgement stops logging again', async () => {
    await accept(W1.id, jill);
    expect((await mcp(jillTok, 'bureau_log_activity', { request: 'Plan the hiring loop for design' })).data.status).toBe('logged');
    const rv = await asUser(consentDelete, jill, 'http://localhost/api/activity/consent', { method: 'DELETE' });
    expect(rv.body.status.accepted).toBe(false);
    expect((await mcp(jillTok, 'bureau_log_activity', { request: 'should not be stored' })).data.status).toBe('consent_required');
    const ok = await asUser(consentPost, jill, 'http://localhost/api/activity/consent', { method: 'POST' });
    expect(ok.body.status.accepted).toBe(true);
    expect((await rowsFor(W1.id, jill))).toHaveLength(1);
  });
});

describe('reading activity: owners/admins only', () => {
  beforeAll(async () => {
    await accept(W2.id, mia);
    await mcp(miaTok, 'bureau_log_activity', { request: 'W2 confidential acquisition plan' });
    await mcp(jillTok, 'bureau_log_activity', { request: 'Review the Acme contract redlines' });
  });

  it('owner searches the whole workspace; every word must match', async () => {
    const r = await mcp(ownerTok, 'bureau_search_activity', { query: 'acme invoice' });
    expect(r.body.error).toBeUndefined();
    expect(r.data.count).toBe(1);
    expect(r.data.entries[0].request).toContain('Build the Acme invoice report');
    expect(r.data.entries[0].request).toContain('[REDACTED:openai_key]');
    expect(r.data.entries[0].who).toBe(jack.email);
    const acme = await mcp(ownerTok, 'bureau_search_activity', { query: 'ACME' });
    expect(acme.data.count).toBe(2);
    expect(JSON.stringify(acme.data)).not.toContain('W2 confidential');
  });

  it('timeline for one person, with personal entries shown as hidden', async () => {
    const r = await mcp(adaTok, 'bureau_activity_timeline', { who: 'jack' });
    expect(r.body.error).toBeUndefined();
    expect(r.data.who.handle).toBe('jack-claude');
    expect(r.data.entries.map((e: any) => e.request)).toEqual(['(hidden as personal)', expect.stringContaining('Acme invoice')]);
    expect(JSON.stringify(r.data)).not.toContain('doctor');
    expect(JSON.stringify(r.data)).not.toContain('contract redlines');
  });

  it('members are denied even with a forged activity:read scope; team:read alone is not enough', async () => {
    const forged = await mcp(jackTokForged, 'bureau_search_activity', { query: 'acme' });
    expect(forged.body.error.message).toMatch(/only visible to workspace owners and admins/);
    const member = await mcp(jillTok, 'bureau_activity_timeline', { who: 'jack' });
    expect(member.body.error.message).toMatch(/Missing required scope: activity:read/);
    const oldOwner = await mcp(ownerTokNoActivity, 'bureau_search_activity', {});
    expect(oldOwner.body.error.message).toMatch(/reconnect/);
  });

  it('a removed admin loses access immediately', async () => {
    expect((await mcp(rexTok, 'bureau_search_activity', {})).body.error).toBeUndefined();
    await q(`UPDATE bureau.workspace_members SET removed_at = NOW() WHERE workspace_id = $1 AND user_id = $2`, [W1.id, rex.userId]);
    expect((await mcp(rexTok, 'bureau_search_activity', {})).body.error).toBeDefined();
    const direct = await db.withUser(rex.userId, rex.email, async (cl) => (await cl.query(`SELECT id FROM bureau.activity_logs WHERE workspace_id = $1`, [W1.id])).rows);
    expect(direct).toHaveLength(0);
  });

  it('another workspace owner sees none of W1, and cannot resolve W1 people', async () => {
    const r = await mcp(w2OwnerTok, 'bureau_search_activity', { query: 'acme' });
    expect(r.data.count).toBe(0);
    const t = await mcp(w2OwnerTok, 'bureau_activity_timeline', { who: 'jack' });
    expect(t.data.status).toBe('not_found');
    const own = await mcp(w2OwnerTok, 'bureau_search_activity', {});
    expect(own.data.entries.map((e: any) => e.request)).toEqual(['W2 confidential acquisition plan']);
  });

  it('RLS directly: a member sees only their own rows; a leader sees the workspace', async () => {
    const asJill = await db.withUser(jill.userId, jill.email, async (cl) => (await cl.query(`SELECT user_id FROM bureau.activity_logs`)).rows);
    expect(asJill.length).toBeGreaterThan(0);
    expect(asJill.every((r: any) => r.user_id === jill.userId)).toBe(true);
    const asOwner = await db.withUser(W1.owner.userId, W1.owner.email, async (cl) => (await cl.query(`SELECT DISTINCT user_id FROM bureau.activity_logs`)).rows);
    expect(asOwner.map((r: any) => r.user_id).sort()).toEqual([jack.userId, jill.userId].sort());
  });
});

describe('personal-hide and delete', () => {
  it('the employee can hide their own entry (content erased); a leader cannot hide or delete it', async () => {
    const { data } = await mcp(jackTok, 'bureau_log_activity', { request: 'Look up flights for my vacation' });
    const id = data.id;
    const leaderHide = await asUser(entryPatch, W1.owner, `http://localhost/api/activity/${id}`, { method: 'PATCH', body: { hidden: true } }, { params: Promise.resolve({ id }) });
    expect(leaderHide.status).toBe(404);
    const leaderDel = await asUser(entryDelete, W1.owner, `http://localhost/api/activity/${id}`, { method: 'DELETE' }, { params: Promise.resolve({ id }) });
    expect(leaderDel.status).toBe(404);
    const hide = await asUser(entryPatch, jack, `http://localhost/api/activity/${id}`, { method: 'PATCH', body: { hidden: true } }, { params: Promise.resolve({ id }) });
    expect(hide.status).toBe(200);
    const [row] = await q(`SELECT * FROM bureau.activity_logs WHERE id = $1`, [id]);
    expect(row.hidden_at).not.toBeNull();
    expect(row.request_enc).toBeNull();
    const again = await mcp(ownerTok, 'bureau_search_activity', { query: 'vacation' });
    expect(again.data.count).toBe(0);
  });

  it('hidden entries cannot be un-hidden or refilled; content and identity cannot be edited', async () => {
    const [hidden] = await q(`SELECT id FROM bureau.activity_logs WHERE user_id = $1 AND hidden_at IS NOT NULL LIMIT 1`, [jack.userId]);
    await expect(db.withUser(jack.userId, jack.email, (cl) => cl.query(
      `UPDATE bureau.activity_logs SET hidden_at = NULL, request_enc = 'v1:a:b:c' WHERE id = $1`, [hidden.id]
    ))).rejects.toThrow();
    const [visible] = await q(`SELECT id FROM bureau.activity_logs WHERE user_id = $1 AND hidden_at IS NULL LIMIT 1`, [jack.userId]);
    await expect(db.withUser(jack.userId, jack.email, (cl) => cl.query(
      `UPDATE bureau.activity_logs SET request_enc = 'v1:a:b:c' WHERE id = $1`, [visible.id]
    ))).rejects.toThrow(/content cannot be edited/);
    await expect(db.withUser(jack.userId, jack.email, (cl) => cl.query(
      `UPDATE bureau.activity_logs SET expires_at = NOW() + INTERVAL '80 days' WHERE id = $1`, [visible.id]
    ))).rejects.toThrow(/only hiding/);
  });

  it('the employee can delete their own entry', async () => {
    const { data } = await mcp(jackTok, 'bureau_log_activity', { request: 'pasted the wrong thing' });
    const del = await asUser(entryDelete, jack, `http://localhost/api/activity/${data.id}`, { method: 'DELETE' }, { params: Promise.resolve({ id: data.id }) });
    expect(del.status).toBe(200);
    expect(await q(`SELECT id FROM bureau.activity_logs WHERE id = $1`, [data.id])).toHaveLength(0);
  });
});

describe('web API /api/activity', () => {
  it('member gets only their own entries even when asking for someone else', async () => {
    const r = await asUser(activityGet, jill, `http://localhost/api/activity?user_id=${jack.userId}`);
    expect(r.status).toBe(200);
    expect(r.body.is_leader).toBe(false);
    expect(r.body.scope).toBe('mine');
    expect(r.body.people).toBeUndefined();
    expect(r.body.entries.length).toBeGreaterThan(0);
    expect(r.body.entries.every((e: any) => e.user_id === jill.userId)).toBe(true);
  });

  it('owner gets people, search and per-person timeline', async () => {
    const all = await asUser(activityGet, W1.owner, 'http://localhost/api/activity');
    expect(all.body.is_leader).toBe(true);
    const emails = all.body.people.map((p: any) => p.email);
    expect(emails).toContain(jack.email);
    expect(emails).not.toContain(rex.email); // removed
    const jackP = all.body.people.find((p: any) => p.email === jack.email);
    expect(jackP.consent_accepted).toBe(true);
    expect(jackP.hidden_7d).toBeGreaterThanOrEqual(2);
    const tl = await asUser(activityGet, W1.owner, `http://localhost/api/activity?user_id=${jack.userId}`);
    expect(tl.body.entries.every((e: any) => e.user_id === jack.userId)).toBe(true);
    const s = await asUser(activityGet, W1.owner, 'http://localhost/api/activity?q=redlines');
    expect(s.body.entries).toHaveLength(1);
    const bad = await asUser(activityGet, W1.owner, 'http://localhost/api/activity?user_id=not-a-uuid');
    expect(bad.body.entries).toHaveLength(0);
  });

  it('consent GET returns the notice and the owner as privacy contact', async () => {
    const r = await asUser(consentGet, jack, 'http://localhost/api/activity/consent');
    expect(r.body.status.accepted).toBe(true);
    expect(r.body.notice.who).toMatch(/owners and admins/);
    expect(r.body.contact).toContain(W1.owner.email);
  });

  it('unauthenticated requests are rejected', async () => {
    expect((await asUser(activityGet, null, 'http://localhost/api/activity')).status).toBe(401);
  });
});

describe('retention (30 days)', () => {
  it('expired rows are never returned and the cron purge deletes only expired rows', async () => {
    const { data } = await mcp(jackTok, 'bureau_log_activity', { request: 'expired acme thing' });
    await q(`ALTER TABLE bureau.activity_logs DISABLE TRIGGER activity_logs_guard_update`);
    try {
      await q(`UPDATE bureau.activity_logs SET received_at = NOW() - INTERVAL '31 days', occurred_at = NOW() - INTERVAL '31 days', expires_at = NOW() - INTERVAL '1 day' WHERE id = $1`, [data.id]);
    } finally {
      await q(`ALTER TABLE bureau.activity_logs ENABLE TRIGGER activity_logs_guard_update`);
    }
    const s = await mcp(ownerTok, 'bureau_search_activity', { query: 'expired' });
    expect(s.data.count).toBe(0);
    const before = (await q(`SELECT count(*)::int n FROM bureau.activity_logs WHERE expires_at > NOW()`))[0].n;

    const saved = process.env.CRON_SECRET;
    try {
      delete process.env.CRON_SECRET;
      const unset = await cronGet(new NextRequest('http://localhost/api/cron/activity-retention', { headers: { authorization: 'Bearer ' } }));
      expect(unset.status).toBe(401);
      process.env.CRON_SECRET = randomBytes(24).toString('hex');
      const wrong = await cronGet(new NextRequest('http://localhost/api/cron/activity-retention', { headers: { authorization: 'Bearer nope' } }));
      expect(wrong.status).toBe(401);
      const ok = await cronGet(new NextRequest('http://localhost/api/cron/activity-retention', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
      expect(ok.status).toBe(200);
      expect((await ok.json()).deleted).toBeGreaterThanOrEqual(1);
    } finally {
      if (saved === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saved;
    }
    expect(await q(`SELECT id FROM bureau.activity_logs WHERE id = $1`, [data.id])).toHaveLength(0);
    expect((await q(`SELECT count(*)::int n FROM bureau.activity_logs WHERE expires_at > NOW()`))[0].n).toBe(before);
  });

  it('retention can never exceed 90 days', async () => {
    await expect(q(`INSERT INTO bureau.activity_logs (workspace_id, user_id, request_enc, expires_at) VALUES ($1, $2, 'v1:a:b:c', NOW() + INTERVAL '91 days')`, [W1.id, jack.userId]))
      .rejects.toThrow(/retention_max_90d/);
  });
});

describe('UI render', () => {
  it('the connect notice explains what, why, who, retention and control, with an unticked box', async () => {
    const React = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { default: ActivityNotice } = await import('../components/ActivityNotice');
    const html = renderToString(React.createElement(ActivityNotice, { checked: false, onChange: () => {} }));
    for (const s of ['logged to Bureau', 'Why:', 'Who can see it:', '30 days', 'personal']) expect(html).toContain(s);
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('checked=""');
  });

  it('the activity page and Top Floor link render', async () => {
    const React = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { default: ActivityPage } = await import('../app/activity/page');
    const html = renderToString(React.createElement(ActivityPage));
    expect(html).toContain('My activity');
    expect(html).toContain('bureau_log_activity');
    const { default: TopFloor } = await import('../app/top-floor/page-content');
    const tf = renderToString(React.createElement(TopFloor as any, { streams: [], recentLogs: [], tokensCount: 0, dueDecisions: [], userEmail: 'x@y.z' }));
    expect(tf).toContain('>Activity<');
  });
});
