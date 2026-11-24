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
  type: 'intake' | 'cost' | 'metric' | 'finding' | 'decision';
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
    
    // Resolve credential (OAuth access token or legacy ingest token)
    const credRows = await query<{
      workspace_id: string;
      user_id: string;
      user_email: string;
      token_id: string | null;
      agent_link_id: string | null;
      allowed_stream_ids: string[] | null;
      allow_create_streams: boolean;
      scopes: string[];
    }>(
      `SELECT workspace_id, user_id, user_email, token_id, agent_link_id, 
              allowed_stream_ids, allow_create_streams, scopes
       FROM bureau.resolve_credential($1)`,
      [token]
    );
    
    if (credRows.length === 0) {
      return NextResponse.json({ 
        error: 'Invalid or revoked token' 
      }, { status: 401 });
    }
    
    const tokenInfo = credRows[0];
    const userEmail = tokenInfo.user_email;
    
    // Check scopes for OAuth tokens
    if (tokenInfo.agent_link_id && !tokenInfo.scopes.includes('ingest:write')) {
      return NextResponse.json({ 
        error: 'Missing required scope: ingest:write' 
      }, { status: 403 });
    }
    
    // 2. Parse payload (catch malformed JSON)
    let payload: IngestPayload;
    try {
      payload = await request.json();
    } catch (error) {
      return NextResponse.json({ 
        error: 'Malformed JSON payload' 
      }, { status: 400 });
    }
    
    // 3. Validate required fields and type
    const validTypes = ['intake', 'cost', 'metric', 'finding', 'decision'];
    
    if (!payload.type || !payload.content) {
      return NextResponse.json({ 
        error: 'Missing required fields: type, content' 
      }, { status: 400 });
    }
    
    if (!validTypes.includes(payload.type)) {
      return NextResponse.json({ 
        error: `Invalid type. Must be one of: ${validTypes.join(', ')}` 
      }, { status: 400 });
    }

    // Validate decision-specific fields
    if (payload.type === 'decision') {
      const { title, action, metric_name, review_date } = payload.metadata || {};
      if (!title || !action || !metric_name || !review_date) {
        return NextResponse.json({
          error: 'Decision type requires metadata: title, action, metric_name, review_date'
        }, { status: 400 });
      }
    }
    
    // Validate stream name length
    if (payload.stream && payload.stream.length > 100) {
      return NextResponse.json({ 
        error: 'Stream name too long (max 100 characters)' 
      }, { status: 400 });
    }
    
    // 4. Run queries with proper user context
    const { withUser } = await import('@/lib/db');
    
    const { streamId, ingestLogId, decisionId } = await withUser(tokenInfo.user_id, userEmail, async (client) => {
      // Look up or create stream by name or ID
      let streamId: string | null = null;
      
      if (payload.stream) {
        const streamName = payload.stream;
        
        // Check if it's a valid UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const isUuid = uuidRegex.test(streamName);
        
        if (isUuid) {
          // Try as UUID (with workspace filter)
          const uuidStreamRows = await client.query(
            `SELECT id FROM bureau.streams 
             WHERE workspace_id = $1 
             AND id = $2::uuid`,
            [tokenInfo.workspace_id, streamName]
          );
          
          if (uuidStreamRows.rows.length > 0) {
            streamId = uuidStreamRows.rows[0].id;
            
            // For OAuth tokens: check if stream is in allowed list
            if (tokenInfo.allowed_stream_ids && streamId && !tokenInfo.allowed_stream_ids.includes(streamId)) {
              throw new Error('Stream not in allowed list for this token');
            }
          } else {
            // UUID format but not an existing stream -> 404
            throw new Error(`STREAM_NOT_FOUND:${streamName}`);
          }
        } else {
          // Try by name (exact match, case-insensitive, workspace-scoped)
          const streamRows = await client.query(
            `SELECT id FROM bureau.streams 
             WHERE workspace_id = $1 
             AND lower(name) = lower($2)`,
            [tokenInfo.workspace_id, streamName]
          );
          
          if (streamRows.rows.length > 0) {
            streamId = streamRows.rows[0].id;
            
            // For OAuth tokens: check if stream is in allowed list
            if (tokenInfo.allowed_stream_ids && streamId && !tokenInfo.allowed_stream_ids.includes(streamId)) {
              throw new Error('Stream not in allowed list for this token');
            }
          } else {
            // Create stream only if allowed
            if (tokenInfo.agent_link_id && !tokenInfo.allow_create_streams) {
              throw new Error('Stream not found and token cannot create streams');
            }
            
            // Check stream count limit (max 50 auto-created streams per workspace)
            const countRows = await client.query(
              `SELECT COUNT(*) as count FROM bureau.streams 
               WHERE workspace_id = $1`,
              [tokenInfo.workspace_id]
            );
            
            const streamCount = parseInt(countRows.rows[0].count);
            if (streamCount >= 50) {
              throw new Error('STREAM_LIMIT_REACHED');
            }
            
            // Auto-create stream by name for new pilots
            const createRows = await client.query(
              `INSERT INTO bureau.streams (workspace_id, name, category, description)
               VALUES ($1, $2, 'production', 'Auto-created from agent ingest')
               RETURNING id`,
              [tokenInfo.workspace_id, streamName]
            );
            streamId = createRows.rows[0].id;
          }
        }
      }
      
      // Handle decision type - create decision record
      let decisionId: string | null = null;
      if (payload.type === 'decision') {
        const { title, action, metric_name, baseline_value, baseline_unit, review_date } = payload.metadata || {};
        
        const decisionRows = await client.query(
          `INSERT INTO bureau.decisions (
            workspace_id, stream_id, title, action, metric_name,
            baseline_value, baseline_unit, review_date, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id`,
          [
            tokenInfo.workspace_id,
            streamId || null,
            title,
            action,
            metric_name,
            baseline_value || null,
            baseline_unit || null,
            review_date,
            tokenInfo.user_id
          ]
        );
        decisionId = decisionRows.rows[0].id;
      }

      // Log ingest using SECURITY DEFINER function
      const fullPayload = {
        type: payload.type,
        stream: payload.stream,
        stream_id: streamId,
        content: payload.content,
        metadata: payload.metadata || {},
        decision_id: decisionId,
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
        ingestLogId: logRows.rows[0].id,
        decisionId
      };
    });
    
    // 5. For now, all ingests are logged as pending for manual review
    // Future: auto-process cost entries
    
    return NextResponse.json({ 
      success: true,
      ingest_id: ingestLogId,
      stream_id: streamId,
      decision_id: decisionId,
      status: 'pending'
    });
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    // Handle specific error cases
    if (errorMsg.startsWith('STREAM_NOT_FOUND:')) {
      const streamId = errorMsg.split(':')[1];
      return NextResponse.json({ 
        error: `Stream not found: ${streamId}` 
      }, { status: 404 });
    }
    
    if (errorMsg === 'STREAM_LIMIT_REACHED') {
      return NextResponse.json({ 
        error: 'Stream limit reached (50). Delete unused streams or contact support.' 
      }, { status: 429 });
    }
    
    console.error('Ingest error:', error);
    return NextResponse.json({ 
      error: 'Failed to process ingest'
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
    types: ['intake', 'cost', 'metric', 'finding', 'decision'],
    docs: 'https://github.com/TravisBuilds/bureau/blob/main/docs/BUREAU.md'
  });
}
