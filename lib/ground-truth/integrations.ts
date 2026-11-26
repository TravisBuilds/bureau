/* eslint-disable @typescript-eslint/no-explicit-any -- vendor JSON and pg rows are untyped; every field is narrowed before use */
/**
 * Integration + identity-link management (runs inside withUser, so RLS decides who may do what:
 * owners/admins for workspace-level sources, the person themself for personal ones).
 * Secrets never leave this module in API responses: the GitHub signing secret is generated here
 * and returned exactly once at creation; vendor-issued secrets/keys are write-only.
 */
import { randomBytes, randomUUID } from 'crypto';
import { encryptScoped } from '../activity-crypto';
import type { Queryable } from '../activity-log';
import { slugProject } from './classify';
import { PERSONAL_PROVIDERS, PROVIDERS, WEBHOOK_PROVIDERS, type Provider } from './types';

export const APP_BASE_URL = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://bureau-krustbuild.vercel.app').replace(/\/$/, '');
export const webhookUrl = (provider: string, id: string) => `${APP_BASE_URL()}/api/webhooks/${provider}/${id}`;

export class IntegrationInputError extends Error {}

export interface IntegrationView {
  id: string;
  provider: Provider;
  label: string;
  personal: boolean;
  owner_user_id: string | null;
  owner_email: string | null;
  status: string;
  config: Record<string, unknown>;
  has_secret: boolean;
  has_credential: boolean;
  last_event_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  webhook_url: string | null;
  created_at: string;
}

const isProvider = (p: unknown): p is Provider => typeof p === 'string' && (PROVIDERS as readonly string[]).includes(p);

/** project_map: { "<repo / team key / folder / project name>": "<project-slug>" } (max 100 entries). */
export function cleanConfig(provider: Provider, raw: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  if (r.project_map !== undefined) {
    if (!r.project_map || typeof r.project_map !== 'object' || Array.isArray(r.project_map)) throw new IntegrationInputError('project_map must be an object');
    const entries = Object.entries(r.project_map as Record<string, unknown>);
    if (entries.length > 100) throw new IntegrationInputError('project_map has more than 100 entries');
    const map: Record<string, string> = {};
    for (const [k, v] of entries) {
      const slug = slugProject(String(v ?? ''));
      if (!k.trim() || k.length > 200 || !slug) throw new IntegrationInputError(`Bad project_map entry: ${k.slice(0, 40)}`);
      map[k.trim().toLowerCase()] = slug;
    }
    out.project_map = map;
  }
  if (provider === 'google_drive' && r.folder_id !== undefined && r.folder_id !== null && r.folder_id !== '') {
    if (typeof r.folder_id !== 'string' || !/^[A-Za-z0-9_-]{5,200}$/.test(r.folder_id)) throw new IntegrationInputError('folder_id must be a Drive folder id');
    out.folder_id = r.folder_id;
  }
  return out;
}

export interface CreateInput {
  workspaceId: string;
  userId: string;
  provider: unknown;
  label?: unknown;
  config?: unknown;
  secret?: unknown;      // vendor-issued signing secret (Vercel, Linear, Sentry)
  credential?: unknown;  // API key (ElevenLabs personal, Higgsfield org) or Google refresh token (callback only)
}

/** Returns the view plus, for GitHub, the generated signing secret (shown once). */
export async function createIntegration(client: Queryable, input: CreateInput): Promise<{ integration: IntegrationView; signing_secret?: string }> {
  if (!isProvider(input.provider)) throw new IntegrationInputError('Unknown provider');
  const provider = input.provider;
  const id = randomUUID();
  const personal = PERSONAL_PROVIDERS.includes(provider);
  const label = typeof input.label === 'string' ? input.label.trim().slice(0, 100) : '';
  const config = cleanConfig(provider, input.config);
  let secretPlain: string | null = null;
  let generated: string | undefined;
  let credentialPlain: string | null = null;

  if (provider === 'github') {
    generated = randomBytes(32).toString('hex');
    secretPlain = generated;
  } else if (WEBHOOK_PROVIDERS.includes(provider)) {
    if (typeof input.secret !== 'string' || input.secret.trim().length < 8 || input.secret.length > 500) {
      throw new IntegrationInputError(`Paste the signing secret ${provider} shows when you create the webhook`);
    }
    secretPlain = input.secret.trim();
  } else {
    if (typeof input.credential !== 'string' || input.credential.trim().length < 8 || input.credential.length > 4000) {
      throw new IntegrationInputError(provider === 'google_drive' ? 'Connect Google Drive with the Connect button' : 'An API key is required');
    }
    credentialPlain = input.credential.trim();
  }
  const parts = [input.workspaceId, id];
  const rows = (await client.query(
    `INSERT INTO bureau.integrations (id, workspace_id, provider, owner_user_id, label, config, secret_enc, credential_enc, created_by)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
     RETURNING *`,
    [id, input.workspaceId, provider, personal ? input.userId : null, label, JSON.stringify(config),
     secretPlain ? encryptScoped('integration', secretPlain, parts) : null,
     credentialPlain ? encryptScoped('integration', credentialPlain, parts) : null,
     input.userId]
  )).rows;
  return { integration: toView(rows[0], null), ...(generated ? { signing_secret: generated } : {}) };
}

function toView(r: any, ownerEmail: string | null): IntegrationView {
  return {
    id: r.id, provider: r.provider, label: r.label, personal: !!r.owner_user_id,
    owner_user_id: r.owner_user_id, owner_email: ownerEmail ?? r.owner_email ?? null,
    status: r.status, config: r.config || {},
    has_secret: !!r.secret_enc, has_credential: !!r.credential_enc,
    last_event_at: r.last_event_at ? new Date(r.last_event_at).toISOString() : null,
    last_sync_at: r.last_sync_at ? new Date(r.last_sync_at).toISOString() : null,
    last_error: r.last_error,
    webhook_url: WEBHOOK_PROVIDERS.includes(r.provider) ? webhookUrl(r.provider, r.id) : null,
    created_at: new Date(r.created_at).toISOString(),
  };
}

export async function listIntegrations(client: Queryable, workspaceId: string): Promise<IntegrationView[]> {
  const rows = (await client.query(
    `SELECT i.*, wm.email AS owner_email
       FROM bureau.integrations i
       LEFT JOIN bureau.workspace_members wm ON wm.workspace_id = i.workspace_id AND wm.user_id = i.owner_user_id
      WHERE i.workspace_id = $1
      ORDER BY i.created_at`,
    [workspaceId]
  )).rows;
  return rows.map(r => toView(r, r.owner_email));
}

export async function updateIntegration(client: Queryable, workspaceId: string, id: string, patch: { status?: unknown; label?: unknown; config?: unknown; secret?: unknown; credential?: unknown }): Promise<IntegrationView | null> {
  const cur = (await client.query(`SELECT * FROM bureau.integrations WHERE id = $1 AND workspace_id = $2`, [id, workspaceId])).rows[0];
  if (!cur) return null;
  const sets: string[] = [];
  const params: unknown[] = [id, workspaceId];
  const add = (sql: string, v: unknown) => { params.push(v); sets.push(`${sql} = $${params.length}`); };
  if (patch.status !== undefined) {
    if (patch.status !== 'active' && patch.status !== 'paused') throw new IntegrationInputError('status must be active or paused');
    add('status', patch.status);
  }
  if (patch.label !== undefined) add('label', String(patch.label ?? '').trim().slice(0, 100));
  if (patch.config !== undefined) add('config', JSON.stringify(cleanConfig(cur.provider, patch.config)));
  const parts = [workspaceId, id];
  if (patch.secret !== undefined && cur.provider !== 'github' && WEBHOOK_PROVIDERS.includes(cur.provider)) {
    if (typeof patch.secret !== 'string' || patch.secret.trim().length < 8 || patch.secret.length > 500) throw new IntegrationInputError('Bad signing secret');
    add('secret_enc', encryptScoped('integration', patch.secret.trim(), parts));
  }
  if (patch.credential !== undefined && (cur.provider === 'elevenlabs' || cur.provider === 'higgsfield')) {
    if (typeof patch.credential !== 'string' || patch.credential.trim().length < 8 || patch.credential.length > 4000) throw new IntegrationInputError('Bad API key');
    add('credential_enc', encryptScoped('integration', patch.credential.trim(), parts));
  }
  if (!sets.length) return toView(cur, null);
  const rows = (await client.query(
    `UPDATE bureau.integrations SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 AND workspace_id = $2 RETURNING *`,
    params
  )).rows;
  return rows[0] ? toView(rows[0], null) : null;
}

/** GitHub only: issue a fresh signing secret (shown once). */
export async function rotateGithubSecret(client: Queryable, workspaceId: string, id: string): Promise<string | null> {
  const secret = randomBytes(32).toString('hex');
  const res = await client.query(
    `UPDATE bureau.integrations SET secret_enc = $3, updated_at = NOW() WHERE id = $1 AND workspace_id = $2 AND provider = 'github'`,
    [id, workspaceId, encryptScoped('integration', secret, [workspaceId, id])]
  );
  return res.rowCount ? secret : null;
}

export async function deleteIntegration(client: Queryable, workspaceId: string, id: string): Promise<boolean> {
  const res = await client.query(`DELETE FROM bureau.integrations WHERE id = $1 AND workspace_id = $2`, [id, workspaceId]);
  return (res.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Identity links
// ---------------------------------------------------------------------------
export async function listIdentityLinks(client: Queryable, workspaceId: string, userId?: string | null) {
  const rows = (await client.query(
    `SELECT l.id, l.user_id, l.provider, l.external_id, l.created_at, wm.email
       FROM bureau.identity_links l
       LEFT JOIN bureau.workspace_members wm ON wm.workspace_id = l.workspace_id AND wm.user_id = l.user_id
      WHERE l.workspace_id = $1 AND ($2::uuid IS NULL OR l.user_id = $2)
      ORDER BY wm.email, l.provider`,
    [workspaceId, userId || null]
  )).rows;
  return rows.map(r => ({ id: r.id, user_id: r.user_id, email: r.email, provider: r.provider, external_id: r.external_id, created_at: new Date(r.created_at).toISOString() }));
}

export async function addIdentityLink(client: Queryable, workspaceId: string, actorId: string, input: { user_id?: unknown; provider?: unknown; external_id?: unknown }) {
  if (!isProvider(input.provider)) throw new IntegrationInputError('Unknown provider');
  const ext = typeof input.external_id === 'string' ? input.external_id.trim().replace(/^@/, '').toLowerCase() : '';
  if (!ext || ext.length > 200) throw new IntegrationInputError('external_id is required (e.g. a GitHub username)');
  const target = typeof input.user_id === 'string' && input.user_id ? input.user_id : actorId;
  const rows = (await client.query(
    `INSERT INTO bureau.identity_links (workspace_id, user_id, provider, external_id, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (workspace_id, provider, external_id) DO NOTHING
     RETURNING id`,
    [workspaceId, target, input.provider, ext, actorId]
  )).rows;
  if (!rows.length) throw new IntegrationInputError('That account is already linked to someone in this workspace');
  return { id: rows[0].id as string };
}

export async function deleteIdentityLink(client: Queryable, workspaceId: string, id: string): Promise<boolean> {
  const res = await client.query(`DELETE FROM bureau.identity_links WHERE id = $1 AND workspace_id = $2`, [id, workspaceId]);
  return (res.rowCount ?? 0) > 0;
}
