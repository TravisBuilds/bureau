import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { query } from '@/lib/db';

/**
 * GET /api/connections - List user's OAuth connections
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    
    if (!user.workspaceId) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 403 });
    }
    
    // Fetch grants with client info
    const grants = await query<{
      id: string;
      client_id: string;
      client_name: string;
      vendor: string;
      connected_at: Date;
      last_seen_at: Date | null;
      status: string;
    }>(
      `SELECT g.id, g.client_id, c.client_name, g.vendor, g.connected_at, g.last_seen_at, g.status
       FROM bureau.oauth_grants g
       JOIN bureau.oauth_clients c ON c.client_id = g.client_id
       WHERE g.workspace_id = $1 AND g.user_id = $2
       ORDER BY g.connected_at DESC`,
      [user.workspaceId, user.id]
    );
    
    // Fetch agent links for each grant
    const connections = await Promise.all(
      grants.map(async (grant) => {
        const links = await query<{
          id: string;
          agent_label: string;
          stream_count: number;
          last_used_at: Date | null;
        }>(
          `SELECT id, agent_label, 
                  array_length(stream_ids, 1) as stream_count,
                  last_used_at
           FROM bureau.agent_links
           WHERE grant_id = $1 AND status = 'active'
           ORDER BY created_at`,
          [grant.id]
        );
        
        return {
          ...grant,
          agent_links: links
        };
      })
    );
    
    return NextResponse.json({ connections });
    
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Error listing connections:', error);
    return NextResponse.json({ error: 'Failed to list connections' }, { status: 500 });
  }
}
