/**
 * Shared post-login logic for all auth flows
 * - Claim pilot invite
 * - Accept email workspace invites
 * - Auto-join default workspace (when BUREAU_DEFAULT_WORKSPACE_ID is set) or bootstrap pilot workspace
 * - Determine redirect (onboarding vs next vs top-floor)
 */

import { withUser, query } from './db';
import { cookies } from 'next/headers';
import { safeNext, NEXT_COOKIE } from './safe-next';

export interface PostLoginResult {
  redirect: string;
  workspaceId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Server-side configured default workspace for open team auto-join.
 * When unset/empty, Bureau keeps invite-only behavior.
 */
export function getDefaultWorkspaceId(): string | null {
  const raw = process.env.BUREAU_DEFAULT_WORKSPACE_ID?.trim();
  if (!raw) return null;
  if (!UUID_RE.test(raw)) {
    throw new Error('Invalid BUREAU_DEFAULT_WORKSPACE_ID');
  }
  return raw;
}

/**
 * Idempotently join a user without an active workspace into BUREAU_DEFAULT_WORKSPACE_ID
 * as a regular 'member'. Existing members (in any workspace) and removed members are unchanged.
 */
async function joinDefaultWorkspaceInTx(
  client: any,
  userId: string,
  email: string,
  defaultWorkspaceId: string
): Promise<string | null> {
  // Use SAVEPOINT + plain INSERT (no ON CONFLICT / RETURNING) so bureau_app only exercises
  // the workspace_member_insert WITH CHECK (user_id = auth.uid()) RLS policy without needing SELECT on conflict.
  await client.query('SAVEPOINT auto_join_default_workspace');
  try {
    await client.query(
      `INSERT INTO bureau.workspace_members (workspace_id, user_id, email, role, joined_at)
       VALUES ($1::uuid, $2::uuid, $3, 'member', NOW())`,
      [defaultWorkspaceId, userId, email.toLowerCase()]
    );
    await client.query('RELEASE SAVEPOINT auto_join_default_workspace');
  } catch (err: any) {
    await client.query('ROLLBACK TO SAVEPOINT auto_join_default_workspace');
    // 23505 = unique_violation (concurrent sign-in race or previously removed member row)
    if (err?.code !== '23505') {
      throw err;
    }
  }

  // Verify active membership now exists (returns 0 rows if the user was previously removed)
  const joined = await client.query(
    `SELECT w.id FROM bureau.workspaces w
     JOIN bureau.workspace_members wm ON wm.workspace_id = w.id
     WHERE wm.workspace_id = $1::uuid
       AND wm.user_id = $2::uuid
       AND wm.removed_at IS NULL`,
    [defaultWorkspaceId, userId]
  );
  return joined.rows[0]?.id ?? null;
}

/**
 * Ensure an authenticated user without a workspace joins BUREAU_DEFAULT_WORKSPACE_ID if configured.
 * Returns the workspace ID (existing or newly joined), or null if not configured / removed.
 */
export async function ensureDefaultWorkspaceMembership(
  userId: string,
  email: string
): Promise<string | null> {
  const defaultWorkspaceId = getDefaultWorkspaceId();
  if (!defaultWorkspaceId) {
    return null;
  }

  return withUser(userId, email, async (client) => {
    const existing = await client.query(
      `SELECT w.id FROM bureau.workspaces w
       JOIN bureau.workspace_members wm ON wm.workspace_id = w.id
       WHERE wm.user_id = $1::uuid AND wm.removed_at IS NULL
       LIMIT 1`,
      [userId]
    );
    if (existing.rows.length > 0) {
      return existing.rows[0].id;
    }

    return joinDefaultWorkspaceInTx(client, userId, email, defaultWorkspaceId);
  });
}

export async function handlePostLogin(
  userId: string,
  email: string,
  nextUrl?: string
): Promise<PostLoginResult> {
  // Read invite code from cookie
  const cookieStore = await cookies();
  const inviteCode = cookieStore.get('bureau_invite')?.value;
  
  // Claim invite if provided
  let inviteClaimed = false;
  if (inviteCode) {
    const claimResult = await query<{ claim_pilot_invite: boolean }>(
      'SELECT bureau.claim_pilot_invite($1, $2) as claim_pilot_invite',
      [inviteCode, userId]
    );
    inviteClaimed = claimResult[0]?.claim_pilot_invite || false;
    
    // Clear the cookie
    cookieStore.delete('bureau_invite');
  }
  
  // Accept any pending workspace invites for this email
  await query(
    'SELECT * FROM bureau.accept_invite($1, $2)',
    [email, userId]
  );
  
  const workspaceId = await withUser(userId, email, async (client) => {
    // Check if user has an active workspace membership
    const workspaces = await client.query(
      `SELECT w.id FROM bureau.workspaces w
       JOIN bureau.workspace_members wm ON wm.workspace_id = w.id
       WHERE wm.user_id = $1::uuid AND wm.removed_at IS NULL`,
      [userId]
    );

    if (workspaces.rows.length === 0) {
      // Check if user has a valid claimed pilot invite
      const invites = await client.query(
        `SELECT code FROM bureau.pilot_invites 
         WHERE claimed_by = $1
         AND expires_at > NOW()`,
        [userId]
      );
      
      if (invites.rows.length > 0 || inviteClaimed) {
        // Pilot invite path: create own workspace as owner using SECURITY DEFINER function
        const workspaceName = `${email.split('@')[0]}'s Workspace`;
        const result = await client.query(
          'SELECT bureau.bootstrap_workspace($1, $2) as workspace_id',
          [workspaceName, email]
        );
        return result.rows[0].workspace_id;
      }

      // Open team auto-join if default workspace is configured
      const defaultWorkspaceId = getDefaultWorkspaceId();
      if (defaultWorkspaceId) {
        const joinedId = await joinDefaultWorkspaceInTx(client, userId, email, defaultWorkspaceId);
        if (joinedId) {
          return joinedId;
        }
      }

      // No workspace, no valid invite, and no default workspace (or removed)
      throw new Error('INVITE_REQUIRED');
    }

    return workspaces.rows[0].id;
  });

  // Check if this was a new workspace (redirect to onboarding)
  const isNew = await withUser(userId, email, async (client) => {
    const result = await client.query(
      `SELECT signup_completed_at FROM bureau.onboarding_progress 
       WHERE workspace_id = $1 
       AND signup_completed_at > NOW() - INTERVAL '1 minute'`,
      [workspaceId]
    );
    return result.rows.length > 0;
  });

  // next comes from the URL/body (untrusted) or the bureau_next cookie set at sign-in.
  // Only same-origin relative paths are honoured (blocks //evil, /\\evil, absolute URLs).
  const cookieNext = cookieStore.get(NEXT_COOKIE)?.value;
  if (cookieNext !== undefined) cookieStore.delete(NEXT_COOKIE);
  const target = safeNext(nextUrl && nextUrl !== '/' ? nextUrl : cookieNext);

  const redirect = isNew 
    ? '/onboarding' 
    : (target && target !== '/' ? target : '/top-floor');

  return { redirect, workspaceId };
}
