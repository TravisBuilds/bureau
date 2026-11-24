import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { query } from '@/lib/db';

/**
 * GET /api/streams - List streams for current user's workspace
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    
    if (!user.workspaceId) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 403 });
    }

    const streams = await query<{
      id: string;
      name: string;
      category: string;
      description: string;
      connected: boolean;
      visible: boolean;
    }>(
      `SELECT id, name, category, description, connected, visible
       FROM bureau.streams
       WHERE workspace_id = $1 AND visible = true
       ORDER BY name`,
      [user.workspaceId]
    );

    return NextResponse.json({ streams });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Error fetching streams:', error);
    return NextResponse.json({ error: 'Failed to fetch streams' }, { status: 500 });
  }
}
