import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { withUser } from '@/lib/db';

/**
 * GET /api/connections - List user's OAuth connections
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    
    if (!user.workspaceId) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 403 });
    }
    
    // Read as the signed-in user so oauth_grants / agent_links RLS applies
    const connections = await withUser(user.id, user.email, async (client) => {
      const grants = (await client.query(
        `SELECT g.id, g.client_id, c.client_name, g.vendor, g.connected_at, g.last_seen_at, g.status
         FROM bureau.oauth_grants g
         JOIN bureau.oauth_clients c ON c.client_id = g.client_id
         WHERE g.workspace_id = $1 AND g.user_id = $2
         ORDER BY g.connected_at DESC`,
        [user.workspaceId, user.id]
      )).rows as Array<{
        id: string; client_id: string; client_name: string; vendor: string;
        connected_at: Date; last_seen_at: Date | null; status: string;
      }>;
      const out = [];
      for (const grant of grants) {
        const links = (await client.query(
          `SELECT id, agent_label,
                  array_length(stream_ids, 1) as stream_count,
                  last_used_at
           FROM bureau.agent_links
           WHERE grant_id = $1 AND status = 'active'
           ORDER BY created_at`,
          [grant.id]
        )).rows as Array<{ id: string; agent_label: string; stream_count: number; last_used_at: Date | null }>;
        out.push({ ...grant, agent_links: links });
      }
      return out;
    });
    
    return NextResponse.json({ connections });
    
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Error listing connections:', error);
    return NextResponse.json({ error: 'Failed to list connections' }, { status: 500 });
  }
}
