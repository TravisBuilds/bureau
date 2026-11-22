import { NextRequest, NextResponse } from 'next/server';
import { LocalAuthAdapter } from '@/lib/auth-adapter';
import { query, execute } from '@/lib/db';
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
  
  try {
    // Check if user has a workspace
    const workspaces = await query<{ id: string }>(
      `SELECT w.id FROM workspaces w
       JOIN workspace_members wm ON wm.workspace_id = w.id
       WHERE wm.user_id = $1::uuid`,
      [userId]
    );
    
    if (workspaces.length === 0) {
      // Create workspace for new user
      const workspaceName = `${session.user.email.split('@')[0]}'s Workspace`;
      
      const newWorkspace = await query<{ id: string }>(
        'INSERT INTO workspaces (name, created_by) VALUES ($1, $2::uuid) RETURNING id',
        [workspaceName, userId]
      );
      
      const workspaceId = newWorkspace[0].id;
      
      // Add user as owner
      await execute(
        `INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
         VALUES ($1::uuid, $2::uuid, 'owner', NOW())`,
        [workspaceId, userId]
      );
      
      // Track onboarding
      await execute(
        'INSERT INTO onboarding_progress (workspace_id, signup_completed_at) VALUES ($1::uuid, NOW())',
        [workspaceId]
      );
      
      // Redirect to onboarding
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }
    
    // User has workspace, go to top floor
    return NextResponse.redirect(new URL('/top-floor', request.url));
  } catch (error) {
    console.error('Error checking/creating workspace:', error);
    return NextResponse.redirect(new URL('/auth/signin?error=workspace-error', request.url));
  }
}
