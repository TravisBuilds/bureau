import { NextRequest, NextResponse } from 'next/server';
import { query, withUser } from '@/lib/db';

/**
 * Bureau MCP Server (Streamable HTTP transport)
 * Implements Model Context Protocol with OAuth 2.1 auth
 * 
 * Tools:
 * - bureau_report_cost: Report cost/metric into allowed streams
 * - bureau_list_streams: List streams this agent can access
 * - bureau_whoami: Get agent link info
 */

interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number | null; // null for notification errors per JSON-RPC
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate with Bearer token
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Return 401 with WWW-Authenticate per RFC 9728
      return new NextResponse(
        JSON.stringify({ error: 'Missing or invalid Authorization header' }),
        {
          status: 401,
          headers: {
            'WWW-Authenticate': `Bearer realm="${process.env.NEXT_PUBLIC_APP_URL || 'https://bureau-krustbuild.vercel.app'}/mcp", resource_metadata="${process.env.NEXT_PUBLIC_APP_URL || 'https://bureau-krustbuild.vercel.app'}/.well-known/oauth-protected-resource"`
          }
        }
      );
    }
    
    const token = authHeader.substring(7);
    
    // Resolve credential (OAuth or legacy)
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
      return new NextResponse(
        JSON.stringify({ error: 'Invalid or revoked token' }),
        { status: 401 }
      );
    }
    
    const cred = credRows[0];
    
    // 2. Parse MCP request
    let mcpRequest: MCPRequest;
    try {
      mcpRequest = await request.json();
    } catch {
      return NextResponse.json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: 'Parse error'
        }
      } as MCPResponse);
    }
    
    // 3. Handle MCP methods
    const { method, params, id } = mcpRequest;
    
    // tools/list - List available tools
    if (method === 'tools/list') {
      return NextResponse.json({
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            {
              name: 'bureau_report_cost',
              description: 'Report cost, metric, or finding into Bureau stream',
              inputSchema: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['cost', 'metric', 'finding', 'intake'],
                    description: 'Type of data being reported'
                  },
                  stream: {
                    type: 'string',
                    description: 'Stream name or ID (must be in allowed list)'
                  },
                  content: {
                    type: 'string',
                    description: 'Human-readable content'
                  },
                  metadata: {
                    type: 'object',
                    description: 'Additional structured data (cost_usd, etc.)',
                    additionalProperties: true
                  }
                },
                required: ['type', 'stream', 'content']
              }
            },
            {
              name: 'bureau_list_streams',
              description: 'List streams accessible to this agent',
              inputSchema: {
                type: 'object',
                properties: {}
              }
            },
            {
              name: 'bureau_whoami',
              description: 'Get information about this agent connection',
              inputSchema: {
                type: 'object',
                properties: {}
              }
            }
          ]
        }
      } as MCPResponse);
    }
    
    // tools/call - Execute a tool
    if (method === 'tools/call') {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      
      if (toolName === 'bureau_whoami') {
        // Return agent link info
        if (cred.agent_link_id) {
          const linkRows = await query<{
            agent_label: string;
            stream_ids: string[];
            allow_create_streams: boolean;
            scopes: string[];
          }>(
            `SELECT agent_label, stream_ids, allow_create_streams, scopes
             FROM bureau.agent_links
             WHERE id = $1`,
            [cred.agent_link_id]
          );
          
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    agent_label: linkRows[0]?.agent_label || 'Unknown',
                    allowed_streams: linkRows[0]?.stream_ids?.length || 0,
                    allow_create_streams: linkRows[0]?.allow_create_streams || false,
                    scopes: linkRows[0]?.scopes || cred.scopes
                  }, null, 2)
                }
              ]
            }
          } as MCPResponse);
        } else {
          // Legacy token
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    agent_label: 'Legacy Token',
                    allowed_streams: 'all',
                    allow_create_streams: true,
                    scopes: ['ingest:write']
                  }, null, 2)
                }
              ]
            }
          } as MCPResponse);
        }
      }
      
      if (toolName === 'bureau_list_streams') {
        // List accessible streams
        let streamRows: Array<{ id: string; name: string; category: string }>;
        
        if (cred.allowed_stream_ids && cred.allowed_stream_ids.length > 0) {
          streamRows = await query<{ id: string; name: string; category: string }>(
            `SELECT id, name, category FROM bureau.streams
             WHERE workspace_id = $1 AND id = ANY($2)
             ORDER BY name`,
            [cred.workspace_id, cred.allowed_stream_ids]
          );
        } else if (cred.agent_link_id && !cred.allow_create_streams) {
          // No streams allowed
          streamRows = [];
        } else {
          // Legacy token or allow_create_streams: list all
          streamRows = await query<{ id: string; name: string; category: string }>(
            `SELECT id, name, category FROM bureau.streams
             WHERE workspace_id = $1
             ORDER BY name`,
            [cred.workspace_id]
          );
        }
        
        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(streamRows, null, 2)
              }
            ]
          }
        } as MCPResponse);
      }
      
      if (toolName === 'bureau_report_cost') {
        // Report cost/metric - use existing ingest logic
        const { type, stream, content, metadata } = toolArgs;
        
        if (!type || !stream || !content) {
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: 'Missing required parameters: type, stream, content'
            }
          } as MCPResponse);
        }
        
        // Check stream access and resolve stream ID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const isUuid = uuidRegex.test(stream);
        
        const result = await withUser(cred.user_id, cred.user_email, async (client) => {
          // stream is validated above as non-null string
          const streamStr = stream as string;
          let streamId: string;
          
          if (isUuid) {
            // UUID stream lookup
            const uuidStreamRows = await client.query(
              `SELECT id FROM bureau.streams WHERE workspace_id = $1 AND id = $2::uuid`,
              [cred.workspace_id, streamStr]
            );
            
            if (uuidStreamRows.rows.length > 0) {
              streamId = uuidStreamRows.rows[0].id;
              
              // Check if allowed
              if (cred.allowed_stream_ids && !cred.allowed_stream_ids.includes(streamId)) {
                throw new Error('STREAM_NOT_ALLOWED');
              }
            } else {
              throw new Error('STREAM_NOT_FOUND');
            }
          } else {
            // Name lookup
            const nameStreamRows = await client.query(
              `SELECT id FROM bureau.streams WHERE workspace_id = $1 AND lower(name) = lower($2)`,
              [cred.workspace_id, streamStr]
            );
            
            if (nameStreamRows.rows.length > 0) {
              streamId = nameStreamRows.rows[0].id;
              
              // Check if allowed
              if (cred.allowed_stream_ids && !cred.allowed_stream_ids.includes(streamId)) {
                throw new Error('STREAM_NOT_ALLOWED');
              }
            } else {
              // Auto-create if allowed
              if (!cred.allow_create_streams) {
                throw new Error('STREAM_NOT_FOUND_AND_CREATE_NOT_ALLOWED');
              }
              
              // Check 50 stream limit
              const countRows = await client.query(
                `SELECT COUNT(*) as count FROM bureau.streams WHERE workspace_id = $1`,
                [cred.workspace_id]
              );
              
              if (parseInt(countRows.rows[0].count) >= 50) {
                throw new Error('STREAM_LIMIT_REACHED');
              }
              
              const createRows = await client.query(
                `INSERT INTO bureau.streams (workspace_id, name, category, description)
                 VALUES ($1, $2, 'production', 'Auto-created from MCP agent')
                 RETURNING id`,
                [cred.workspace_id, streamStr]
              );
              
              streamId = createRows.rows[0].id;
            }
          }
          
          // Log ingest
          const payload = {
            type,
            stream,
            stream_id: streamId,
            content,
            metadata: metadata || {},
            received_at: new Date().toISOString(),
            agent_link_id: cred.agent_link_id
          };
          
          const logRows = await client.query(
            `SELECT bureau.insert_ingest_log($1::uuid, $2::uuid, $3::jsonb) as id`,
            [cred.workspace_id, cred.token_id || cred.agent_link_id, JSON.stringify(payload)]
          );
          
          return { ingest_id: logRows.rows[0].id, stream_id: streamId };
        });
        
        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  ingest_id: result.ingest_id,
                  stream_id: result.stream_id,
                  status: 'pending'
                }, null, 2)
              }
            ]
          }
        } as MCPResponse);
      }
      
      // Unknown tool
      return NextResponse.json({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Unknown tool: ${toolName}`
        }
      } as MCPResponse);
    }
    
    // Unknown method
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32601,
        message: `Method not found: ${method}`
      }
    } as MCPResponse);
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    // Handle specific errors
    if (errorMsg === 'STREAM_NOT_ALLOWED') {
      return NextResponse.json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32000,
          message: 'Stream not allowed for this agent. Add it at bureau-krustbuild.vercel.app/connections'
        }
      } as MCPResponse, { status: 403 });
    }
    
    console.error('MCP error:', error);
    return NextResponse.json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32603,
        message: 'Internal error'
      }
    } as MCPResponse, { status: 500 });
  }
}

// OPTIONS for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type'
    }
  });
}
