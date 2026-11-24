/**
 * Test fixtures for Digital Clone security tests.
 *
 * - Seeds as a privileged role (TEST_DATABASE_URL_ADMIN, e.g. postgres) because
 *   bureau_app has no access to auth.* or the OAuth secret tables (by design).
 * - The app under test runs as bureau_app via DATABASE_URL.
 * - OAuth access tokens go through the real chain:
 *   oauth_clients -> oauth_grants -> agent_links -> oauth_tokens,
 *   stored as encode(digest(token,'sha256'),'hex') exactly like mint_oauth_tokens.
 */
import { Pool } from 'pg';
import { randomBytes } from 'crypto';

const ADMIN_URL = process.env.TEST_DATABASE_URL_ADMIN;
if (!ADMIN_URL) throw new Error('TEST_DATABASE_URL_ADMIN is required (privileged role used only for seeding)');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required (bureau_app connection used by the app)');
if (/supabase\.(co|com)/.test(ADMIN_URL + process.env.DATABASE_URL)) {
  throw new Error('Refusing to run security tests against a Supabase-hosted database');
}

export const admin = new Pool({ connectionString: ADMIN_URL, max: 3 });
export const ALL_SCOPES = ['ingest:write', 'clone:write', 'questions:read', 'questions:write', 'team:read'];

export const uid = () => randomBytes(6).toString('hex');

export async function q<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  return (await admin.query(sql, params)).rows;
}

export interface Member { userId: string; email: string }
export interface Workspace { id: string; owner: Member }

const created = { workspaces: [] as string[], users: [] as string[], clients: [] as string[] };

export async function createUser(label: string): Promise<Member> {
  const email = `${label}-${uid()}@clone-test.local`;
  const [u] = await q<{ id: string }>(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [email]);
  created.users.push(u.id);
  return { userId: u.id, email };
}

export async function createWorkspace(label: string): Promise<Workspace> {
  const owner = await createUser(`${label}-owner`);
  const [w] = await q<{ id: string }>(
    `INSERT INTO bureau.workspaces (name, created_by) VALUES ($1, $2) RETURNING id`,
    [`${label}-${uid()}`, owner.userId]
  );
  created.workspaces.push(w.id);
  await addMember(w.id, owner, 'owner');
  return { id: w.id, owner };
}

export async function addMember(workspaceId: string, m: Member, role: 'owner' | 'admin' | 'member' = 'member') {
  await q(
    `INSERT INTO bureau.workspace_members (workspace_id, user_id, email, role, joined_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [workspaceId, m.userId, m.email, role]
  );
}

/** A registered static OAuth client (for the authorization-code flow). */
export async function createClient(redirectUri = 'http://localhost/cb'): Promise<string> {
  const clientId = `test-client-${uid()}`;
  await q(
    `INSERT INTO bureau.oauth_clients (client_id, client_name, redirect_uris, registration, vendor, verified)
     VALUES ($1, 'Clone test client', ARRAY[$2], 'static', 'other', true)`,
    [clientId, redirectUri]
  );
  created.clients.push(clientId);
  return clientId;
}

/** Real chain: client -> grant -> agent_link -> access token (hex sha256). Returns the raw token. */
export async function createOAuthToken(opts: {
  workspaceId: string; userId: string; scopes?: string[];
  streamIds?: string[]; allowCreateStreams?: boolean; label?: string;
}): Promise<{ token: string; grantId: string; agentLinkId: string }> {
  const scopes = opts.scopes ?? ALL_SCOPES;
  const clientId = `test-client-${uid()}`;
  await q(
    `INSERT INTO bureau.oauth_clients (client_id, client_name, redirect_uris, registration, vendor, verified)
     VALUES ($1, 'Clone test client', ARRAY['http://localhost/cb'], 'static', 'other', true)`,
    [clientId]
  );
  created.clients.push(clientId);
  const [g] = await q<{ id: string }>(
    `INSERT INTO bureau.oauth_grants (workspace_id, user_id, client_id, scopes)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [opts.workspaceId, opts.userId, clientId, scopes]
  );
  const [l] = await q<{ id: string }>(
    `INSERT INTO bureau.agent_links (workspace_id, grant_id, agent_label, stream_ids, allow_create_streams, scopes)
     VALUES ($1, $2, $3, $4::uuid[], $5, $6) RETURNING id`,
    [opts.workspaceId, g.id, opts.label ?? 'test-agent', opts.streamIds ?? [], opts.allowCreateStreams ?? false, scopes]
  );
  const token = `bureau_at_${randomBytes(24).toString('hex')}`;
  await q(
    `INSERT INTO bureau.oauth_tokens (token_hash, token_prefix, kind, grant_id, family_id, expires_at)
     VALUES (encode(extensions.digest($1, 'sha256'), 'hex'), $2, 'access', $3, extensions.uuid_generate_v4(), NOW() + INTERVAL '1 hour')`,
    [token, token.slice(0, 14), g.id]
  );
  return { token, grantId: g.id, agentLinkId: l.id };
}

/** Legacy pilot ingest token (bureau_<hex>), hashed the way resolve_credential expects. */
export async function createLegacyToken(workspaceId: string): Promise<{ token: string; tokenId: string }> {
  const token = `bureau_${randomBytes(24).toString('hex')}`;
  const [t] = await q<{ id: string }>(
    `INSERT INTO bureau.ingest_tokens (workspace_id, name, token_hash, token_prefix)
     VALUES ($1, 'legacy pilot', encode(extensions.digest($2, 'sha256'), 'hex'), $3) RETURNING id`,
    [workspaceId, token, token.slice(0, 11)]
  );
  return { token, tokenId: t.id };
}

export async function createStream(workspaceId: string, name: string): Promise<string> {
  const [s] = await q<{ id: string }>(
    `INSERT INTO bureau.streams (workspace_id, name, category, description) VALUES ($1, $2, 'production', 'test') RETURNING id`,
    [workspaceId, name]
  );
  return s.id;
}

export async function cleanup() {
  if (created.workspaces.length) await q(`DELETE FROM bureau.workspaces WHERE id = ANY($1::uuid[])`, [created.workspaces]);
  if (created.clients.length) await q(`DELETE FROM bureau.oauth_clients WHERE client_id = ANY($1)`, [created.clients]);
  if (created.users.length) await q(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [created.users]);
  created.workspaces = []; created.clients = []; created.users = [];
}
