/**
 * Auto-join & full-transparency tests — real handlers, real bureau_app role, real Postgres 17.
 * Covers:
 * - auto-join into BUREAU_DEFAULT_WORKSPACE_ID as 'member'
 * - idempotency (sequential + concurrent)
 * - existing members (owner/admin/member in same or other workspace, email-invited) unaffected
 * - removed member stays removed (not re-added)
 * - unset BUREAU_DEFAULT_WORKSPACE_ID preserves INVITE_REQUIRED behavior
 * - pilot-invite path still works (even when BUREAU_DEFAULT_WORKSPACE_ID is set)
 * - invite-required sign-up bounce neutralized when default workspace is set
 * - member sees team health, clones, questions, and receives team:read via MCP
 * - cross-workspace isolation for auto-joined members
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import {
  q, cleanup, admin, uid, createWorkspace, createUser, addMember, createClient,
  type Workspace, type Member,
} from './helpers/clone-fixtures';

const jar = new Map<string, string>();
const deletedCookies: string[] = [];
let sessionUser: { id: string; email: string } | null = null;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: any, value?: any) => {
      if (typeof name === 'object') jar.set(name.name, name.value);
      else jar.set(name, value);
    },
    delete: (name: string) => {
      deletedCookies.push(name);
      jar.delete(name);
    },
  }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: sessionUser } }),
    },
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  redirect: (url: string) => {
    const err: any = new Error(`NEXT_REDIRECT:${url}`);
    err.digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw err;
  },
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.NEXT_PUBLIC_APP_URL = 'https://bureau-krustbuild.vercel.app';

let A: Workspace, B: Workspace;
let cloneA: string, cloneB: string;
const extraWorkspaces: string[] = [];
const extraPilotCodes: string[] = [];

let handlePostLogin: typeof import('../lib/post-login').handlePostLogin;
let ensureDefaultWorkspaceMembership: typeof import('../lib/post-login').ensureDefaultWorkspaceMembership;
let getAuthUser: typeof import('../lib/auth-helpers').getAuthUser;
let teamHealthGet: any, clonesGet: any, questionsGet: any, invitePost: any;
let authorizePost: any, tokenPost: any, mcpPost: any, oauthMeGet: any;

const asUser = async (handler: any, user: Member | null, url = 'http://localhost/api/x', body?: any) => {
  sessionUser = user ? { id: user.userId, email: user.email } : null;
  const res = await handler(
    new NextRequest(url, body === undefined ? { method: 'GET' } : {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
  sessionUser = null;
  return { status: res.status, body: await res.json() };
};

const mcp = async (token: string, name: string, args: any = {}) => {
  const res = await mcpPost(new NextRequest('http://localhost/api/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  }));
  const body = await res.json();
  return { status: res.status, body, data: body.result ? JSON.parse(body.result.content[0].text) : undefined };
};

beforeAll(async () => {
  ({ handlePostLogin, ensureDefaultWorkspaceMembership } = await import('../lib/post-login'));
  ({ getAuthUser } = await import('../lib/auth-helpers'));
  ({ GET: teamHealthGet } = await import('../app/api/team-health/route'));
  ({ GET: clonesGet } = await import('../app/api/clones/route'));
  ({ GET: questionsGet } = await import('../app/api/questions/route'));
  ({ POST: invitePost } = await import('../app/api/team/invite/route'));
  ({ POST: authorizePost } = await import('../app/api/oauth/authorize/route'));
  ({ POST: tokenPost } = await import('../app/api/oauth/token/route'));
  ({ POST: mcpPost } = await import('../app/api/mcp/route'));
  ({ GET: oauthMeGet } = await import('../app/api/oauth/me/route'));

  // Guard: verify bureau_app privilege invariants
  const [g] = await q(`SELECT has_schema_privilege('bureau_app','auth','USAGE') AS auth_usage,
    (SELECT count(*)::int FROM pg_auth_members WHERE member = 'bureau_app'::regrole) AS memberships,
    (SELECT count(*)::int FROM information_schema.role_table_grants WHERE grantee='bureau_app'
       AND table_schema='bureau' AND table_name IN ('oauth_tokens','oauth_codes','oauth_device_codes')) AS secret_grants`);
  if (g.auth_usage || g.memberships || g.secret_grants) {
    throw new Error(`bureau_app is over-privileged in the test DB: ${JSON.stringify(g)}`);
  }

  A = await createWorkspace('aj-wsA');
  B = await createWorkspace('aj-wsB');

  const [ca] = await q<{ id: string }>(
    `INSERT INTO bureau.digital_clones (workspace_id, owner_user_id, display_name, handle, vendor, last_seen_at)
     VALUES ($1, $2, 'Travis Clone', $3, 'anthropic', NOW()) RETURNING id`,
    [A.id, A.owner.userId, `travis-${uid()}`]
  );
  cloneA = ca.id;
  await q(
    `INSERT INTO bureau.clone_heartbeats (clone_id, date, top_priority, active, blocked)
     VALUES ($1, '2026-11-24', 'WS-A priority', ARRAY['Ship auto-join'], ARRAY[]::text[])`,
    [cloneA]
  );

  const [cb] = await q<{ id: string }>(
    `INSERT INTO bureau.digital_clones (workspace_id, owner_user_id, display_name, handle, vendor, last_seen_at)
     VALUES ($1, $2, 'Secret B Clone', $3, 'openai', NOW()) RETURNING id`,
    [B.id, B.owner.userId, `secretb-${uid()}`]
  );
  cloneB = cb.id;
  await q(
    `INSERT INTO bureau.clone_heartbeats (clone_id, date, top_priority, active, blocked)
     VALUES ($1, '2026-11-24', 'WS-B secret priority', ARRAY['Top secret B'], ARRAY[]::text[])`,
    [cloneB]
  );
  await q(`SELECT bureau.ask_question($1, 'WS-A team question', $2, NULL, NULL, $3, NULL, 'web')`, [A.id, A.owner.userId, cloneA]);
  await q(`SELECT bureau.ask_question($1, 'WS-B private question', $2, NULL, NULL, $3, NULL, 'web')`, [B.id, B.owner.userId, cloneB]);
});

afterEach(() => {
  jar.clear();
  deletedCookies.length = 0;
  sessionUser = null;
  delete process.env.BUREAU_DEFAULT_WORKSPACE_ID;
});

afterAll(async () => {
  delete process.env.BUREAU_DEFAULT_WORKSPACE_ID;
  if (extraPilotCodes.length) {
    await q(`DELETE FROM bureau.pilot_invites WHERE code = ANY($1)`, [extraPilotCodes]);
  }
  if (extraWorkspaces.length) {
    await q(`DELETE FROM bureau.workspaces WHERE id = ANY($1::uuid[])`, [extraWorkspaces]);
  }
  await cleanup();
  await admin.end();
});

describe('auto-join default workspace', () => {
  it('adds a brand-new signed-in user to BUREAU_DEFAULT_WORKSPACE_ID as member with no invite code', async () => {
    process.env.BUREAU_DEFAULT_WORKSPACE_ID = A.id;
    const newcomer = await createUser('aj-newcomer');

    const res = await handlePostLogin(newcomer.userId, newcomer.email);
    expect(res.workspaceId).toBe(A.id);
    expect(res.redirect).toBe('/top-floor');

    const [row] = await q(
      `SELECT workspace_id, user_id, email, role::text, removed_at
       FROM bureau.workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [A.id, newcomer.userId]
    );
    expect(row).toEqual({
      workspace_id: A.id,
      user_id: newcomer.userId,
      email: newcomer.email.toLowerCase(),
      role: 'member',
      removed_at: null,
    });

    sessionUser = { id: newcomer.userId, email: newcomer.email };
    const authUser = await getAuthUser();
    expect(authUser).toEqual({
      id: newcomer.userId,
      email: newcomer.email,
      workspaceId: A.id,
      role: 'member',
    });
  });

  it('preserves next redirect for auto-joined users instead of forcing /onboarding', async () => {
    process.env.BUREAU_DEFAULT_WORKSPACE_ID = A.id;
    const newcomer = await createUser('aj-next');
    const res = await handlePostLogin(newcomer.userId, newcomer.email, '/connect/device?user_code=BURE-XY12');
    expect(res.workspaceId).toBe(A.id);
    expect(res.redirect).toBe('/connect/device?user_code=BURE-XY12');
  });

  it('is idempotent on repeat sign-ins and concurrent calls', async () => {
    process.env.BUREAU_DEFAULT_WORKSPACE_ID = A.id;
    const u = await createUser('aj-idem');

    const r1 = await handlePostLogin(u.userId, u.email);
    const r2 = await handlePostLogin(u.userId, u.email);
    const [r3, r4] = await Promise.all([
      ensureDefaultWorkspaceMembership(u.userId, u.email),
      ensureDefaultWorkspaceMembership(u.userId, u.email),
    ]);

    expect(r1.workspaceId).toBe(A.id);
    expect(r2.workspaceId).toBe(A.id);
    expect(r3).toBe(A.id);
    expect(r4).toBe(A.id);

    const rows = await q(
      `SELECT role::text FROM bureau.workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [A.id, u.userId]
    );
    expect(rows).toEqual([{ role: 'member' }]);
  });

  it('leaves existing members (owner/admin in default ws, members of other ws, email-invited) unaffected', async () => {
    process.env.BUREAU_DEFAULT_WORKSPACE_ID = A.id;

    // 1. Owner of A stays owner in A
    const rOwner = await handlePostLogin(A.owner.userId, A.owner.email);
    expect(rOwner.workspaceId).toBe(A.id);
    const [ownerRow] = await q(`SELECT role::text FROM bureau.workspace_members WHERE workspace_id = $1 AND user_id = $2`, [A.id, A.owner.userId]);
    expect(ownerRow.role).toBe('owner');

    // 2. Admin of A stays admin in A
    const adminA = await createUser('aj-admin');
    await addMember(A.id, adminA, 'admin');
    const rAdmin = await handlePostLogin(adminA.userId, adminA.email);
    expect(rAdmin.workspaceId).toBe(A.id);
    const [adminRow] = await q(`SELECT role::text FROM bureau.workspace_members WHERE workspace_id = $1 AND user_id = $2`, [A.id, adminA.userId]);
    expect(adminRow.role).toBe('admin');

    // 3. Existing member of workspace B stays in B and is NOT added to A
    const memberB = await createUser('aj-memberB');
    await addMember(B.id, memberB, 'member');
    const rOther = await handlePostLogin(memberB.userId, memberB.email);
    expect(rOther.workspaceId).toBe(B.id);
    const inA = await q(`SELECT 1 FROM bureau.workspace_members WHERE workspace_id = $1 AND user_id = $2`, [A.id, memberB.userId]);
    expect(inA).toHaveLength(0);

    // 4. Email-invited user for workspace B joins B, not A
    const invitedB = await createUser('aj-invitedB');
    await q(`SELECT bureau.invite_member($1, $2, 'admin', $3)`, [B.id, invitedB.email, B.owner.userId]);
    const rInvited = await handlePostLogin(invitedB.userId, invitedB.email);
    expect(rInvited.workspaceId).toBe(B.id);
    const inA2 = await q(`SELECT 1 FROM bureau.workspace_members WHERE workspace_id = $1 AND user_id = $2`, [A.id, invitedB.userId]);
    expect(inA2).toHaveLength(0);
  });

  it('does not re-add a member who was explicitly removed from the default workspace', async () => {
    process.env.BUREAU_DEFAULT_WORKSPACE_ID = A.id;
    const u = await createUser('aj-removed');
    await handlePostLogin(u.userId, u.email);
    await q(`SELECT bureau.remove_member($1, $2, $3)`, [A.id, u.userId, A.owner.userId]);

    await expect(handlePostLogin(u.userId, u.email)).rejects.toThrow('INVITE_REQUIRED');
    expect(await ensureDefaultWorkspaceMembership(u.userId, u.email)).toBeNull();
  });

  it('keeps INVITE_REQUIRED behavior when BUREAU_DEFAULT_WORKSPACE_ID is unset', async () => {
    delete process.env.BUREAU_DEFAULT_WORKSPACE_ID;
    const u = await createUser('aj-unset');
    await expect(handlePostLogin(u.userId, u.email)).rejects.toThrow('INVITE_REQUIRED');
    expect(await ensureDefaultWorkspaceMembership(u.userId, u.email)).toBeNull();
  });

  it('pilot-invite path still works even when BUREAU_DEFAULT_WORKSPACE_ID is set', async () => {
    process.env.BUREAU_DEFAULT_WORKSPACE_ID = A.id;
    const pilotCode = `PILOT_${uid().toUpperCase()}`;
    extraPilotCodes.push(pilotCode);
    await q(
      `INSERT INTO bureau.pilot_invites (code, expires_at) VALUES ($1, NOW() + INTERVAL '1 day')`,
      [pilotCode]
    );

    const pilotUser = await createUser('aj-pilot');
    jar.set('bureau_invite', pilotCode);

    const res = await handlePostLogin(pilotUser.userId, pilotUser.email);
    expect(res.workspaceId).not.toBe(A.id);
    expect(res.redirect).toBe('/onboarding');
    extraWorkspaces.push(res.workspaceId);

    const [ownerRow] = await q(
      `SELECT role::text FROM bureau.workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [res.workspaceId, pilotUser.userId]
    );
    expect(ownerRow.role).toBe('owner');
  });
});

describe('invite-required bounce neutralized when default workspace is set', () => {
  it('/auth/signup redirects to /auth/signin when BUREAU_DEFAULT_WORKSPACE_ID is set, and renders form when unset', async () => {
    const { default: SignUpPage } = await import('../app/auth/signup/page');

    process.env.BUREAU_DEFAULT_WORKSPACE_ID = A.id;
    await expect(SignUpPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT:/auth/signin');
    await expect(SignUpPage({ searchParams: Promise.resolve({ next: '/connect' }) })).rejects.toThrow(
      'NEXT_REDIRECT:/auth/signin?next=%2Fconnect'
    );

    delete process.env.BUREAU_DEFAULT_WORKSPACE_ID;
    const el = await SignUpPage({ searchParams: Promise.resolve({}) });
    expect(el).toBeTruthy();
  });

  it('/auth/signin hides invite-code signup link when BUREAU_DEFAULT_WORKSPACE_ID is set', async () => {
    const React = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { default: SignInPage } = await import('../app/auth/signin/page');

    process.env.BUREAU_DEFAULT_WORKSPACE_ID = A.id;
    const htmlWithDefault = renderToString(React.createElement(SignInPage));
    expect(htmlWithDefault).not.toContain('Sign up with invite code');

    delete process.env.BUREAU_DEFAULT_WORKSPACE_ID;
    const htmlWithoutDefault = renderToString(React.createElement(SignInPage));
    expect(htmlWithoutDefault).toContain('Sign up with invite code');
  });

  it('/api/oauth/me and /api/oauth/authorize auto-join a signed-in user with no membership yet', async () => {
    process.env.BUREAU_DEFAULT_WORKSPACE_ID = A.id;
    const pulseUser = await createUser('aj-pulse');

    const meRes = await asUser(oauthMeGet, pulseUser, 'http://localhost/api/oauth/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body.has_workspace).toBe(true);
    expect(meRes.body.role).toBe('member');

    const clientId = await createClient('http://localhost/cb');
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const pulseUser2 = await createUser('aj-pulse2');
    const authRes = await asUser(authorizePost, pulseUser2, 'http://localhost/api/oauth/authorize', {
      client_id: clientId,
      redirect_uri: 'http://localhost/cb',
      state: 'st1',
      code_challenge: challenge,
      agent_label: 'Claude',
      stream_ids: [],
      allow_create_streams: true,
      approved: true,
    });
    expect(authRes.status).toBe(200);
    expect(authRes.body.code).toMatch(/^bur_code_/);
  });
});

describe('full transparency: member sees team health and cross-workspace isolation', () => {
  it('auto-joined member sees team-health, clones, questions, and gets team:read via MCP (own workspace only)', async () => {
    process.env.BUREAU_DEFAULT_WORKSPACE_ID = A.id;
    const member = await createUser('aj-transparency');
    const joined = await handlePostLogin(member.userId, member.email);
    expect(joined.workspaceId).toBe(A.id);

    // Web routes: member sees workspace A data only, never workspace B
    const health = await asUser(teamHealthGet, member);
    expect(health.status).toBe(200);
    const healthStr = JSON.stringify(health.body);
    expect(healthStr).toContain(cloneA);
    expect(healthStr).toContain('WS-A priority');
    expect(healthStr).not.toContain(cloneB);
    expect(healthStr).not.toContain('WS-B secret priority');

    const clones = await asUser(clonesGet, member);
    expect(clones.status).toBe(200);
    expect(clones.body.clones.map((c: any) => c.id)).toContain(cloneA);
    expect(clones.body.clones.map((c: any) => c.id)).not.toContain(cloneB);

    const questions = await asUser(questionsGet, member);
    expect(questions.status).toBe(200);
    const qText = JSON.stringify(questions.body);
    expect(qText).toContain('WS-A team question');
    expect(qText).not.toContain('WS-B private question');

    // Member still cannot invite new members (owner/admin only)
    const inv = await asUser(invitePost, member, 'http://localhost/api/team/invite', {
      email: `x-${uid()}@clone-test.local`,
      role: 'member',
    });
    expect(inv.status).not.toBe(200);

    // OAuth authorize with omitted scopes grants team:read to regular member -> MCP bureau_team_health succeeds
    const clientId = await createClient('http://localhost/cb');
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const authRes = await asUser(authorizePost, member, 'http://localhost/api/oauth/authorize', {
      client_id: clientId,
      redirect_uri: 'http://localhost/cb',
      state: 's',
      code_challenge: challenge,
      agent_label: 'Member Claude',
      stream_ids: [],
      allow_create_streams: true,
      approved: true,
    });
    expect(authRes.status).toBe(200);

    const tokRes = await tokenPost(new NextRequest('http://localhost/api/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authRes.body.code,
        code_verifier: verifier,
        client_id: clientId,
        redirect_uri: 'http://localhost/cb',
      }).toString(),
    }));
    expect(tokRes.status).toBe(200);
    const tokBody = await tokRes.json();
    const accessToken = tokBody.access_token;

    const who = await mcp(accessToken, 'bureau_whoami');
    expect(who.status).toBe(200);
    expect(who.body.error).toBeUndefined();
    expect(who.data.scopes).toContain('team:read');

    const mcpHealth = await mcp(accessToken, 'bureau_team_health');
    expect(mcpHealth.body.error).toBeUndefined();
    const mcpStr = JSON.stringify(mcpHealth.data);
    expect(mcpStr).toContain(cloneA);
    expect(mcpStr).toContain('WS-A priority');
    expect(mcpStr).not.toContain(cloneB);
    expect(mcpStr).not.toContain('WS-B secret priority');

    // Cross-workspace isolation on MCP tools
    const cross = await mcp(accessToken, 'bureau_get_questions', { clone_id: cloneB });
    expect(cross.body.error?.message).toBe('Clone not found or access denied');
  });
});
