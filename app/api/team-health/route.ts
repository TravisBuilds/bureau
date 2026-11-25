import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { ensureDefaultWorkspaceMembership } from '@/lib/post-login';
import { query } from '@/lib/db';

/**
 * GET /api/team-health - Get team health dashboard data
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user.workspaceId) {
      const joined = await ensureDefaultWorkspaceMembership(user.id, user.email);
      if (joined) {
        user.workspaceId = joined;
      }
    }
    
    if (!user.workspaceId) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 403 });
    }

    const clones = await query(
      `SELECT * FROM bureau.get_team_health($1)`,
      [user.workspaceId]
    );

    return NextResponse.json({ clones });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Error fetching team health:', error);
    return NextResponse.json({ error: 'Failed to fetch team health' }, { status: 500 });
  }
}
