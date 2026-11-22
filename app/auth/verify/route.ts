import { NextRequest, NextResponse } from 'next/server';
import { LocalAuthAdapter } from '@/lib/auth-adapter';
import { query, execute, withUser } from '@/lib/db';
import { cookies } from 'next/headers';

const auth = new LocalAuthAdapter();

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  
  if (!token) {
    return NextResponse.redirect(new URL('/auth/signin?error=missing-token', request.url));
  }
  
  // Verify token
  const session = await auth.verifyToken(token);
  
  if (!session) {
    return NextResponse.redirect(new URL('/auth/signin?error=invalid-token', request.url));
  }
  
  // Set session cookie
  const cookieStore = await cookies();
  cookieStore.set('bureau_session', session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: session.expiresAt,
  });
  
  const userId = session.user.id;
  const email = session.user.email;
  
  try {
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

    if (isNew) {
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }
    
    // User has workspace, go to top floor
    return NextResponse.redirect(new URL('/top-floor', request.url));
  } catch (error) {
    if (error instanceof Error && error.message === 'INVITE_REQUIRED') {
      return NextResponse.redirect(new URL('/auth/signup?error=invite-required', request.url));
    }
    console.error('Error checking/creating workspace:', error);
    return NextResponse.redirect(new URL('/auth/signin?error=workspace-error', request.url));
  }
}
