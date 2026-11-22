import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';

/**
 * Bureau Ingest API
 * 
 * Agents POST findings, costs, and stream updates here with Bearer token auth.
 * 
 * Example:
 * POST /api/ingest
 * Authorization: Bearer bureau_123abc...
 * Content-Type: application/json
 * 
 * {
 *   "type": "intake",
 *   "stream": "ember",
 *   "content": "Published Ep13 Short: 34 views in first day, $31.42 cost",
 *   "metadata": {
 *     "output_id": "ep13",
 *     "cost_usd": 31.42,
 *     "views": 34
 *   }
 * }
 */

interface IngestPayload {
  type: 'intake' | 'cost' | 'metric' | 'finding';
  stream?: string; // stream name or ID
  content: string;
  metadata?: Record<string, any>;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate with Bearer token
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ 
        error: 'Missing or invalid Authorization header. Use: Authorization: Bearer <token>' 
      }, { status: 401 });
    }
    
    const token = authHeader.substring(7); // Remove "Bearer "
    
    // Look up token using SECURITY DEFINER function (bypasses RLS, returns email)
    const tokenRows = await query<{
      workspace_id: string;
      user_id: string;
      user_email: string;
      token_id: string;
    }>(
      `SELECT workspace_id, user_id, user_email, token_id
       FROM bureau.resolve_ingest_token($1)`,
      [token]
    );
    
    // RETURNS TABLE means empty set on miss (not NULL row)
    if (tokenRows.length === 0) {
      return NextResponse.json({ 
        error: 'Invalid or revoked token' 
      }, { status: 401 });
    }
    
    const tokenInfo = tokenRows[0];
    const userEmail = tokenInfo.user_email;
    
    // 2. Parse payload
    const payload: IngestPayload = await request.json();
    
    if (!payload.type || !payload.content) {
      return NextResponse.json({ 
        error: 'Missing required fields: type, content' 
      }, { status: 400 });
    }
    
    // 3. Run queries with proper user context
    const { withUser } = await import('@/lib/db');
    
    const { streamId, ingestLogId } = await withUser(tokenInfo.user_id, userEmail, async (client) => {
      // Look up or create stream by name or ID
      let streamId: string | null = null;
      
      if (payload.stream) {
        // Cap stream name length
        const streamName = payload.stream.substring(0, 100);
        
        // Check if it's a valid UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const isUuid = uuidRegex.test(streamName);
        
        if (isUuid) {
          // Try as UUID first (with workspace filter)
          const uuidStreamRows = await client.query(
            `SELECT id FROM bureau.streams 
             WHERE workspace_id = $1 
             AND id = $2::uuid`,
            [tokenInfo.workspace_id, streamName]
          );
          
          if (uuidStreamRows.rows.length > 0) {
            streamId = uuidStreamRows.rows[0].id;
          }
        }
        
        if (!streamId) {
          // Try by name (exact match, case-insensitive, workspace-scoped)
          const streamRows = await client.query(
            `SELECT id FROM bureau.streams 
             WHERE workspace_id = $1 
             AND lower(name) = lower($2)`,
            [tokenInfo.workspace_id, streamName]
          );
          
          if (streamRows.rows.length > 0) {
            streamId = streamRows.rows[0].id;
          } else {
            // Check stream count limit (max 50 auto-created streams per workspace)
            const countRows = await client.query(
              `SELECT COUNT(*) as count FROM bureau.streams 
               WHERE workspace_id = $1`,
              [tokenInfo.workspace_id]
            );
            
            const streamCount = parseInt(countRows.rows[0].count);
            if (streamCount >= 50) {
              throw new Error('Stream limit reached (50). Delete unused streams or contact support.');
            }
            
            // Auto-create stream by name for new pilots
            const createRows = await client.query(
              `INSERT INTO bureau.streams (workspace_id, name, type, status)
               VALUES ($1, $2, 'agent', 'active')
               RETURNING id`,
              [tokenInfo.workspace_id, streamName]
            );
            streamId = createRows.rows[0].id;
          }
        }
      }
      
      // Log ingest using SECURITY DEFINER function
      const fullPayload = {
        type: payload.type,
        stream: payload.stream,
        stream_id: streamId,
        content: payload.content,
        metadata: payload.metadata || {},
        received_at: new Date().toISOString()
      };
      
      const logRows = await client.query(
        `SELECT bureau.insert_ingest_log($1::uuid, $2::uuid, $3::jsonb) as id`,
        [
          tokenInfo.workspace_id,
          tokenInfo.token_id,
          JSON.stringify(fullPayload)
        ]
      );
      
      return {
        streamId,
        ingestLogId: logRows.rows[0].id
      };
    });
    
    // 5. For now, all ingests are logged as pending for manual review
    // Future: auto-process cost entries
    
    return NextResponse.json({ 
      success: true,
      ingest_id: ingestLogId,
      stream_id: streamId,
      status: 'pending'
    });
    
  } catch (error) {
    console.error('Ingest error:', error);
    return NextResponse.json({ 
      error: 'Failed to process ingest',
      details: String(error)
    }, { status: 500 });
  }
}

// GET /api/ingest - return usage info
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/ingest',
    method: 'POST',
    auth: 'Bearer token (get from workspace settings)',
    example: {
      type: 'intake',
      stream: 'ember',
      content: 'Published Ep13 Short: 34 views, $31.42 cost',
      metadata: {
        output_id: 'ep13',
        cost_usd: 31.42,
        views: 34
      }
    },
    types: ['intake', 'cost', 'metric', 'finding'],
    docs: 'https://github.com/bureau/bureau/blob/main/docs/BUREAU.md'
  });
}
