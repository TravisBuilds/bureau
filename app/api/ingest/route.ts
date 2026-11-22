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
    
    // Look up token in database
    const tokenRows = await query<{
      id: string;
      workspace_id: string;
      name: string;
    }>(
      `SELECT id, workspace_id, name
       FROM ingest_tokens 
       WHERE token = $1 AND revoked_at IS NULL`,
      [token]
    );
    
    if (tokenRows.length === 0) {
      return NextResponse.json({ 
        error: 'Invalid or revoked token' 
      }, { status: 401 });
    }
    
    const tokenInfo = tokenRows[0];
    
    // Update last_used_at
    await execute(
      'UPDATE ingest_tokens SET last_used_at = NOW() WHERE id = $1',
      [tokenInfo.id]
    );
    
    // 2. Parse payload
    const payload: IngestPayload = await request.json();
    
    if (!payload.type || !payload.content) {
      return NextResponse.json({ 
        error: 'Missing required fields: type, content' 
      }, { status: 400 });
    }
    
    // 3. Determine stream
    let streamId: string | null = null;
    
    if (!streamId && payload.stream) {
      // Look up stream by name (case-insensitive)
      const streamRows = await query<{ id: string }>(
        `SELECT id FROM streams 
         WHERE workspace_id = $1 
         AND name ILIKE $2`,
        [tokenInfo.workspace_id, payload.stream]
      );
      
      if (streamRows.length > 0) {
        streamId = streamRows[0].id;
      } else {
        // Try as UUID if name lookup failed
        try {
          const uuidStreamRows = await query<{ id: string }>(
            `SELECT id FROM streams 
             WHERE workspace_id = $1 
             AND id = $2::uuid`,
            [tokenInfo.workspace_id, payload.stream]
          );
          if (uuidStreamRows.length > 0) {
            streamId = uuidStreamRows[0].id;
          }
        } catch (err) {
          // Not a valid UUID, ignore
        }
      }
    }
    
    // 4. Log ingest
    const fullPayload = {
      type: payload.type,
      stream: payload.stream,
      stream_id: streamId,
      content: payload.content,
      metadata: payload.metadata || {},
      received_at: new Date().toISOString()
    };
    
    const logRows = await query<{ id: string }>(
      `INSERT INTO ingest_log (
        workspace_id, token_id, payload, status
      ) VALUES ($1, $2, $3, 'pending')
      RETURNING id`,
      [
        tokenInfo.workspace_id,
        tokenInfo.id,
        JSON.stringify(fullPayload)
      ]
    );
    
    const ingestLogId = logRows[0].id;
    
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
