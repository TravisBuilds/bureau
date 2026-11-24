/**
 * Auto-create the Digital Clone for a freshly approved agent link (one-click connect).
 *
 * Runs inside the caller's withUser() transaction so RLS applies. Never repoints an
 * existing clone at a different link (register_clone's ON CONFLICT would do that for the
 * same owner), picks a free handle (base, base-2, base-3, ...), and is fail-soft: every
 * attempt runs in a SAVEPOINT, so a clone problem never blocks token issuance.
 */
import type { PoolClient } from 'pg';

export type CloneVendor = 'openai' | 'anthropic' | 'cursor' | 'custom';

const MAX_HANDLE_LEN = 40;
const MAX_ATTEMPTS = 25;

function hostOf(uri: string | null | undefined): string {
  if (!uri) return '';
  try { return new URL(uri).hostname.toLowerCase(); } catch { return ''; }
}
const isHost = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** Map an oauth_clients/oauth_grants vendor (+ redirect host) to bureau.clone_vendor. */
export function cloneVendorFor(grantVendor: string | null | undefined, redirectUri?: string | null): CloneVendor {
  const host = hostOf(redirectUri);
  if (isHost(host, 'claude.ai') || isHost(host, 'claude.com') || isHost(host, 'anthropic.com')) return 'anthropic';
  if (grantVendor === 'openai') return 'openai';
  if (grantVendor === 'cursor') return 'cursor';
  return 'custom';
}

/** "Travis's Claude" -> "travis-claude". Matches register_clone's ^[a-zA-Z0-9_-]+$. */
export function slugHandle(label: string | null | undefined): string {
  const slug = (label || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['\u2019]s\b/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_HANDLE_LEN)
    .replace(/-+$/g, '');
  return slug || 'agent';
}

export async function ensureCloneForLink(
  client: PoolClient,
  p: { workspaceId: string; userId: string; agentLinkId: string; label: string; vendor: CloneVendor }
): Promise<string | null> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM bureau.digital_clones WHERE agent_link_id = $1 LIMIT 1`, [p.agentLinkId]);
  if (existing.rows[0]) return existing.rows[0].id;

  const base = slugHandle(p.label);
  const taken = new Set(
    (await client.query<{ handle: string }>(
      `SELECT lower(handle) AS handle FROM bureau.digital_clones WHERE workspace_id = $1`, [p.workspaceId]
    )).rows.map(r => r.handle)
  );
  const displayName = (p.label || base).slice(0, 120);

  for (let n = 1, attempts = 0; attempts < MAX_ATTEMPTS; n++) {
    const handle = n === 1 ? base : `${base}-${n}`;
    if (taken.has(handle)) continue;
    attempts++;
    await client.query('SAVEPOINT auto_clone');
    try {
      const r = await client.query<{ id: string }>(
        `SELECT bureau.register_clone($1, $2, $3, $4, $5, $6::bureau.clone_vendor, 'v1', NULL, NULL, NULL) AS id`,
        [p.workspaceId, p.userId, p.agentLinkId, displayName, handle, p.vendor]
      );
      await client.query('RELEASE SAVEPOINT auto_clone');
      return r.rows[0]?.id ?? null;
    } catch (e: any) {
      await client.query('ROLLBACK TO SAVEPOINT auto_clone');
      const msg = String(e?.message || e);
      if (msg.includes('HANDLE_TAKEN') || e?.code === '23505') { taken.add(handle); continue; }
      console.error('auto-clone failed (connect continues without a clone):', msg);
      return null;
    }
  }
  console.error('auto-clone: no free handle for', base);
  return null;
}
