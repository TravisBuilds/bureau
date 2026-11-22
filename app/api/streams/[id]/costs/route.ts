import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    
    if (!user.workspaceId) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 403 });
    }
    
    const { id: streamId } = await params;
    
    // Verify stream belongs to user's workspace and fetch costs from ingest_log
    const data = await withUser(user.id, user.email, async (client) => {
      // Check stream ownership
      const streamCheck = await client.query(
        `SELECT id FROM bureau.streams 
         WHERE id = $1 AND workspace_id = $2`,
        [streamId, user.workspaceId]
      );
      
      if (streamCheck.rows.length === 0) {
        return null; // 404
      }
      
      // Fetch ingest logs for this stream
      const result = await client.query(
        `SELECT 
          il.id,
          il.payload->>'content' as content,
          il.payload->'metadata'->>'cost_usd' as cost_usd,
          il.payload->'metadata' as metadata,
          il.created_at,
          il.status
         FROM bureau.ingest_log il
         WHERE il.workspace_id = $1
         AND il.payload->>'stream_id' IS NOT NULL
         AND il.payload->>'stream_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         AND (il.payload->>'stream_id')::uuid = $2
         ORDER BY il.created_at DESC
         LIMIT 100`,
        [user.workspaceId, streamId]
      );
      
      return result.rows;
    });
    
    if (data === null) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }
    
    // Parse and calculate totals
    const logs = data.map((row: any) => ({
      id: row.id,
      content: row.content,
      cost_usd: row.cost_usd && row.cost_usd.match(/^[0-9]+\.?[0-9]*$/) 
        ? parseFloat(row.cost_usd) 
        : 0,
      metadata: row.metadata || {},
      created_at: row.created_at,
      status: row.status,
    }));
    
    const totalCost = logs.reduce((sum: number, log: any) => sum + log.cost_usd, 0);
    
    return NextResponse.json({
      stream_id: streamId,
      logs,
      summary: {
        total_logs: logs.length,
        total_cost: totalCost,
      }
    });
    
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Error fetching stream costs:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch costs',
      details: String(error)
    }, { status: 500 });
  }
}
