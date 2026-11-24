import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { query } from '@/lib/db';

/**
 * GET /api/team/members - List workspace members and pending invites
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    
    if (!user.workspaceId) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 403 });
    }

    // Get members
    const members = await query<{
      user_id: string;
      email: string;
      role: string;
      joined_at: Date;
      invited_at: Date;
      invited_by: string | null;
      last_seen_at: Date | null;
    }>(
      `SELECT 
        wm.user_id,
        au.email,
        wm.role,
        wm.joined_at,
        wm.invited_at,
        wm.invited_by,
        (
          SELECT MAX(GREATEST(og.last_seen_at, og.connected_at))
          FROM bureau.oauth_grants og
          WHERE og.workspace_id = wm.workspace_id AND og.user_id = wm.user_id
        ) as last_seen_at
       FROM bureau.workspace_members wm
       JOIN auth.users au ON au.id = wm.user_id
       WHERE wm.workspace_id = $1 AND wm.removed_at IS NULL
       ORDER BY wm.role, au.email`,
      [user.workspaceId]
    );

    // Get pending invites
    const invites = await query<{
      id: string;
      email: string;
      role: string;
      invited_at: Date;
      invited_by: string;
      expires_at: Date;
    }>(
      `SELECT 
        i.id,
        i.email,
        i.role,
        i.invited_at,
        i.invited_by,
        i.expires_at
       FROM bureau.workspace_invites i
       WHERE i.workspace_id = $1 
         AND i.accepted_at IS NULL 
         AND i.revoked_at IS NULL
         AND i.expires_at > NOW()
       ORDER BY i.invited_at DESC`,
      [user.workspaceId]
    );

    return NextResponse.json({ members, invites });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Error fetching members:', error);
    return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
  }
}
