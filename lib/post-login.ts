/**
 * Shared post-login logic for all auth flows
 * - Claim pilot invite
 * - Bootstrap workspace if needed
 * - Determine redirect (onboarding vs top-floor)
 */

import { withUser, query } from './db';
import { cookies } from 'next/headers';
import { safeNext, NEXT_COOKIE } from './safe-next';

export interface PostLoginResult {
  redirect: string;
  workspaceId: string;
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
    // Check if user has a workspace
    const workspaces = await client.query(
      `SELECT w.id FROM bureau.workspaces w
       JOIN bureau.workspace_members wm ON wm.workspace_id = w.id
       WHERE wm.user_id = $1::uuid`,
      [userId]
    );

    if (workspaces.rows.length === 0) {
      // Check if user has a valid claimed invite
      const invites = await client.query(
        `SELECT code FROM bureau.pilot_invites 
         WHERE claimed_by = $1
         AND expires_at > NOW()`,
        [userId]
      );
      
      if (invites.rows.length === 0 && !inviteClaimed) {
        // No workspace and no valid invite - redirect to invite required page
        throw new Error('INVITE_REQUIRED');
      }
      
      // Create workspace using SECURITY DEFINER function
      const workspaceName = `${email.split('@')[0]}'s Workspace`;
      const result = await client.query(
        'SELECT bureau.bootstrap_workspace($1, $2) as workspace_id',
        [workspaceName, email]
      );
      return result.rows[0].workspace_id;
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
