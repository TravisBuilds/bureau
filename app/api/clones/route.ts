import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { ensureDefaultWorkspaceMembership } from '@/lib/post-login';
import { query } from '@/lib/db';

/**
 * GET /api/clones - List digital clones in workspace
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

    const { withUser } = await import('@/lib/db');
    
    const clones = await withUser(user.id, user.email, async (client): Promise<Array<{
      id: string;
      display_name: string;
      handle: string;
      vendor: string;
      timezone: string | null;
      slack_handle: string | null;
      owner_email: string;
      last_seen_at: Date | null;
      is_stale: boolean;
    }>> => {
      const result = await client.query(
      `SELECT 
        dc.id,
        dc.display_name,
        dc.handle,
        dc.vendor,
        dc.timezone,
        dc.slack_handle,
        wm.email as owner_email,
        dc.last_seen_at,
        (dc.last_seen_at IS NULL OR dc.last_seen_at < NOW() - INTERVAL '26 hours') as is_stale
       FROM bureau.digital_clones dc
       JOIN bureau.workspace_members wm ON wm.workspace_id = dc.workspace_id AND wm.user_id = dc.owner_user_id AND wm.removed_at IS NULL
       WHERE dc.workspace_id = $1
       ORDER BY dc.display_name`,
        [user.workspaceId]
      );
      return result.rows;
    });

    return NextResponse.json({ clones });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Error fetching clones:', error);
    return NextResponse.json({ error: 'Failed to fetch clones' }, { status: 500 });
  }
}
