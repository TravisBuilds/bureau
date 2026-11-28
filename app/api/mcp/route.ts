import { NextRequest, NextResponse } from 'next/server';
import { query, withUser } from '@/lib/db';
import { lookupClone, formatCandidates, type LookupResponse } from '@/lib/clone-lookup';
import { latestCheckin } from '@/lib/clone-status';
import { canReadTeam, canReadActivity, FULL_TEAM_TRANSPARENCY, ACTIVITY_READ_SCOPE } from '@/lib/oauth-scopes';
import { logActivity, listActivity } from '@/lib/activity-log';
import { ActivityKeyError, activityKeyConfigured } from '@/lib/activity-crypto';
import { AGENT_LOGGING_INSTRUCTIONS, ACTIVITY_RETENTION_DAYS } from '@/lib/activity-policy';
import { recordSignal, teamBoard, listWorkUnits, buildDigest } from '@/lib/ground-truth/work-events';
import { agentSignal, agentToolName } from '@/lib/ground-truth/agent';

/**
 * Bureau MCP Server (Streamable HTTP transport)
 * Implements Model Context Protocol with OAuth 2.1 auth
 * 
 * Tools:
 * - bureau_report_cost: Report cost/metric into allowed streams
 * - bureau_list_streams: List streams this agent can access
 * - bureau_whoami: Get agent link info
 * - bureau_team_health / bureau_ask_question (team:read): read the team, ask a teammate's clone
 * - bureau_log_activity (clone:write + accepted notice): log a work request for this team, once per task
 * - bureau_search_activity / bureau_activity_timeline (activity:read, owners/admins only)
 * - bureau_work_board / bureau_work_timeline / bureau_work_digest (activity:read, owners/admins only):
 *   rule-classified work units from connected tools + AI requests (no LLM involved)
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
      const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
      return new NextResponse(
        JSON.stringify({ error: 'Invalid or revoked token' }),
        { 
          status: 401,
          headers: {
            'WWW-Authenticate': `Bearer realm="${origin}/mcp", resource_metadata="${origin}/.well-known/oauth-protected-resource"`
          }
        }
      );
    }
    
    const cred = credRows[0];

    // team:read tools: the scope must be on the token AND the token owner must still be an
    // active member allowed by canReadTeam (all active members under FULL_TEAM_TRANSPARENCY).
    const leaderDenied = async (): Promise<string | null> => {
      if (!cred.scopes.includes('team:read')) return 'Missing required scope: team:read';
      const roleRows = await withUser(cred.user_id, cred.user_email, async (client) =>
        (await client.query(
          `SELECT role::text AS role FROM bureau.workspace_members
           WHERE workspace_id = $1 AND user_id = $2 AND removed_at IS NULL LIMIT 1`,
          [cred.workspace_id, cred.user_id]
        )).rows as Array<{ role: string }>
      );
      if (canReadTeam(roleRows[0]?.role)) return null;
      return FULL_TEAM_TRANSPARENCY
        ? 'team:read requires active workspace membership'
        : 'team:read is only for workspace owners and admins';
    };
    // activity:read tools: scope on the token AND the caller is an active owner/admin right now.
    // Deliberately NOT team:read (which every member has under full transparency).
    const activityDenied = async (): Promise<string | null> => {
      if (!cred.scopes.includes(ACTIVITY_READ_SCOPE)) return `Missing required scope: ${ACTIVITY_READ_SCOPE} (owners and admins: reconnect your AI to Bureau to get it)`;
      const roleRows = await withUser(cred.user_id, cred.user_email, async (client) =>
        (await client.query(
          `SELECT role::text AS role FROM bureau.workspace_members
           WHERE workspace_id = $1 AND user_id = $2 AND removed_at IS NULL LIMIT 1`,
          [cred.workspace_id, cred.user_id]
        )).rows as Array<{ role: string }>
      );
      return canReadActivity(roleRows[0]?.role) ? null : 'Logged AI activity is only visible to workspace owners and admins';
    };
    const toolText = (rpcId: any, data: any) => NextResponse.json({
      jsonrpc: '2.0', id: rpcId, result: { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] },
    } as MCPResponse);
    const toolError = (rpcId: any, code: number, message: string) =>
      NextResponse.json({ jsonrpc: '2.0', id: rpcId, error: { code, message } } as MCPResponse);
    /** Non-found lookups become a normal tool result the AI can show (candidates / not found). */
    const lookupNotFoundResult = (who: string, r: LookupResponse) =>
      r.status === 'ambiguous'
        ? { status: 'ambiguous', message: `More than one teammate matches "${who}". Ask which one they mean, then call again with the handle.`, candidates: r.candidates.map(c => ({ handle: c.handle, display_name: c.display_name, owner_email: c.owner_email })), summary: formatCandidates(r.candidates) }
        : { status: 'not_found', message: `No teammate's AI matches "${who}" in this workspace. Call bureau_team_health to see who is connected.` };
    
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
    
    // 3. Handle MCP protocol methods
    const { method, params, id } = mcpRequest;
    
    // initialize - protocol handshake
    if (method === 'initialize') {
      const clientVersion = params?.protocolVersion || '2024-11-05';
      const supportedVersions = ['2024-11-05', '2025-06-18'];
      const negotiatedVersion = supportedVersions.includes(clientVersion) ? clientVersion : '2025-06-18';
      
      return NextResponse.json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: negotiatedVersion,
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'Bureau MCP Server',
            version: '1.0.0'
          },
          // MCP InitializeResult.instructions: clients that support it add this to the model's context.
          instructions: AGENT_LOGGING_INSTRUCTIONS
        }
      } as MCPResponse);
    }

    // notifications/initialized - client confirms initialization (202 empty per spec)
    if (method === 'notifications/initialized') {
      return new NextResponse(null, { status: 202 });
    }

    // ping - keepalive
    if (method === 'ping') {
      return NextResponse.json({
        jsonrpc: '2.0',
        id,
        result: {}
      } as MCPResponse);
    }
    
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
              annotations: { readOnlyHint: true },
              description: 'List streams accessible to this agent',
              inputSchema: {
                type: 'object',
                properties: {}
              }
            },
            {
              name: 'bureau_whoami',
              annotations: { readOnlyHint: true },
              description: 'Get information about this agent connection',
              inputSchema: {
                type: 'object',
                properties: {}
              }
            },
            {
              name: 'bureau_register_clone',
              description: 'Register or update a digital clone for a team member',
              inputSchema: {
                type: 'object',
                properties: {
                  display_name: { type: 'string', description: 'Display name (e.g. JacksBot)' },
                  handle: { type: 'string', description: 'Unique handle (e.g. jacksbot)' },
                  vendor: { type: 'string', enum: ['openai', 'anthropic', 'cursor', 'custom'] },
                  timezone: { type: 'string', description: 'IANA timezone (e.g. America/Los_Angeles)' },
                  working_hours: { type: 'object', description: 'Working hours schedule' },
                  slack_handle: { type: 'string', description: 'Slack handle (informational)' }
                },
                required: ['display_name', 'handle', 'vendor']
              }
            },
            {
              name: 'bureau_update_profile',
              description: 'Update digital clone profile',
              inputSchema: {
                type: 'object',
                properties: {
                  clone_id: { type: 'string', description: 'Clone UUID (optional, resolves from agent link)' },
                  responsibilities: { type: 'string' },
                  active_work: { type: 'string' },
                  decisions_pending: { type: 'string' },
                  recent_output: { type: 'string' },
                  availability: { type: 'string' }
                },
                required: []
              }
            },
            {
              name: 'bureau_post_heartbeat',
              description: 'Post your daily check-in (heartbeat) for your Digital Clone. Call once a day; clone_id is optional.',
              inputSchema: {
                type: 'object',
                properties: {
                  clone_id: { type: 'string', description: 'Clone UUID (optional, resolves from agent link)' },
                  date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
                  top_priority: { type: 'string' },
                  active: { type: 'array', items: { type: 'string' } },
                  blocked: { type: 'array', items: { type: 'string' } },
                  decisions_waiting_on_me: { type: 'array', items: { type: 'string' } },
                  waiting_on_others: { type: 'array', items: { type: 'object' } },
                  shipped_since_last: { type: 'array', items: { type: 'string' } },
                  helping: { type: 'array', items: { type: 'object' } },
                  out_of_office: { type: 'boolean' },
                  confidence: { type: 'string' }
                },
                required: ['date', 'top_priority']
              }
            },
            {
              name: 'bureau_log_activity',
              description: 'Log a work request the user made of you for this team. Call once per piece of work, not once per user message. Skip personal matters, small talk and trivial follow-ups. If the user tells you not to log something, do not call this tool. Bureau removes secrets and encrypts the entry; only the user and their workspace owners/admins can read it, and it is deleted after ' + ACTIVITY_RETENTION_DAYS + ' days. Only as a fallback, if you are already logging and the user marks it personal, call with personal=true and request="personal".',
              inputSchema: {
                type: 'object',
                properties: {
                  request: { type: 'string', description: "One or two sentences describing what the user asked (names, projects, files they mentioned). Never include passwords or keys. Max 4000 characters." },
                  detail: { type: 'string', description: 'Optional: what you did for them (sent, edited, created, searched, ran). Max 4000 characters.' },
                  kind: { type: 'string', enum: ['request', 'action'], description: 'request (default) for what they asked; action for something you did on their behalf' },
                  personal: { type: 'boolean', description: 'Fallback only: if you are already logging and the user marked this personal or off the record; only the fact that a personal request happened is stored. If the user told you not to log it, do not call this tool.' },
                  conversation_ref: { type: 'string', description: 'Optional: a conversation/thread id or title, so related entries group together' },
                  occurred_at: { type: 'string', description: 'Optional ISO 8601 time of the request (defaults to now; ignored if not within the last 24 hours)' },
                  project: { type: 'string', description: 'Optional: the project this is for (e.g. "duckduckgoose", "bureau"), if known' },
                  tool: { type: 'string', description: 'Optional: your product name in lower case (e.g. claude, chatgpt, cursor, grok_bot)' },
                  artifact_url: { type: 'string', description: 'Optional: https link to what was produced (PR, deploy, doc, render)' }
                },
                required: ['request']
              }
            },
            {
              name: 'bureau_search_activity',
              annotations: { readOnlyHint: true },
              description: "Owners/admins only: search everyone's logged AI requests from the last " + ACTIVITY_RETENTION_DAYS + " days (what people asked their AI). Every word in query must match. Pass who (name, handle or email) to search one person. Results are newest first; personal entries show as hidden.",
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Words to find (case-insensitive). Omit to list the newest entries.' },
                  who: { type: 'string', description: 'Optional: a teammate name, handle or email' },
                  since: { type: 'string', description: 'Optional ISO 8601 start time' },
                  until: { type: 'string', description: 'Optional ISO 8601 end time' },
                  limit: { type: 'number', description: 'Max entries (1-100, default 25)' }
                }
              }
            },
            {
              name: 'bureau_activity_timeline',
              annotations: { readOnlyHint: true },
              description: "Owners/admins only: one teammate's logged AI requests, newest first, for the last N days (default 7, max " + ACTIVITY_RETENTION_DAYS + "). Use for \"what has Jack been doing?\"",
              inputSchema: {
                type: 'object',
                properties: {
                  who: { type: 'string', description: 'A teammate name, handle or email' },
                  days: { type: 'number', description: 'How many days back (1-' + ACTIVITY_RETENTION_DAYS + ', default 7)' },
                  limit: { type: 'number', description: 'Max entries (1-200, default 100)' }
                },
                required: ['who']
              }
            },
            {
              name: 'bureau_work_board',
              annotations: { readOnlyHint: true },
              description: "Owners/admins only: the Team Work Board. Work units built from GitHub, Vercel, Linear, Sentry, Drive, ElevenLabs, Higgsfield and logged AI requests over the last N days: shipped / in progress / blocked per person and project, throughput per day, tool usage, and who has not accepted the notice. Use for \"what did the team ship this week?\" or \"who is blocked?\"",
              inputSchema: {
                type: 'object',
                properties: {
                  days: { type: 'number', description: 'How many days back (1-' + ACTIVITY_RETENTION_DAYS + ', default 7)' },
                  project: { type: 'string', description: 'Optional project slug to filter to' }
                }
              }
            },
            {
              name: 'bureau_work_timeline',
              annotations: { readOnlyHint: true },
              description: "Owners/admins only: one teammate's work units (what they worked on, with links and status, and whether it is verified by a real artifact, correlated, or self-reported), newest first.",
              inputSchema: {
                type: 'object',
                properties: {
                  who: { type: 'string', description: 'A teammate name, handle or email' },
                  days: { type: 'number', description: 'How many days back (1-' + ACTIVITY_RETENTION_DAYS + ', default 7)' },
                  verified_only: { type: 'boolean', description: 'Only units backed by a real artifact (commit, PR, deploy, render, ...)' }
                },
                required: ['who']
              }
            },
            {
              name: 'bureau_work_digest',
              annotations: { readOnlyHint: true },
              description: 'Owners/admins only: a daily (24h) or weekly (7d) digest of shipped, in-flight and blocked work, by project, plus coverage gaps (who has not accepted the notice or shows no activity).',
              inputSchema: {
                type: 'object',
                properties: {
                  period: { type: 'string', enum: ['daily', 'weekly'], description: 'daily (default) or weekly' },
                  who: { type: 'string', description: 'Optional: limit to one teammate' }
                }
              }
            },
            {
              name: 'bureau_team_health',
              annotations: { readOnlyHint: true },
              description: "See what your team is working on. Returns every teammate's AI with their latest daily check-in (top priority, active work, blockers), profile and whether it is stale. Pass who (a name, handle or email, e.g. \"jack\") to get just one person. Use this first for questions like \"what is Jack working on?\"",
              inputSchema: {
                type: 'object',
                properties: {
                  who: { type: 'string', description: 'Optional: a teammate name, handle, email or Slack handle to filter to one person' }
                }
              }
            },
            {
              name: 'bureau_get_questions',
              annotations: { readOnlyHint: true },
              description: 'Get questions asked of this clone (to answer them). Pass who to see the questions asked of a teammate, with their answers.',
              inputSchema: {
                type: 'object',
                properties: {
                  clone_id: { type: 'string', description: 'Clone UUID (optional, resolves from agent link)' },
                  who: { type: 'string', description: 'Optional: a teammate name, handle or email; returns questions asked of them, including answers' },
                  status: { type: 'string', enum: ['open', 'answered', 'escalated', 'closed'], description: 'Filter by status' }
                },
                required: []
              }
            },
            {
              name: 'bureau_ask_question',
              description: "Ask a teammate's AI a question (e.g. who=\"jack\", question_text=\"Is the release on track?\"). Returns their latest check-in right away as a preview; their AI answers the question the next time it checks in. Read the answer later with bureau_get_questions and the same who.",
              inputSchema: {
                type: 'object',
                properties: {
                  who: { type: 'string', description: 'Teammate name, handle, email or Slack handle' },
                  question_text: { type: 'string', description: 'The question (max 2000 characters)' }
                },
                required: ['who', 'question_text']
              }
            },
            {
              name: 'bureau_answer_question',
              description: 'Answer a question',
              inputSchema: {
                type: 'object',
                properties: {
                  question_id: { type: 'string', description: 'Question UUID' },
                  answer_text: { type: 'string', description: 'Answer text' }
                },
                required: ['question_id', 'answer_text']
              }
            },
            {
              name: 'bureau_escalate_question',
              description: 'Escalate a question to human owner',
              inputSchema: {
                type: 'object',
                properties: {
                  question_id: { type: 'string', description: 'Question UUID' },
                  escalation_reason: { type: 'string', description: 'Reason for escalation' }
                },
                required: ['question_id', 'escalation_reason']
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
          const linkRows = await withUser(cred.user_id, cred.user_email, async (client) =>
            (await client.query(
              `SELECT agent_label, stream_ids, allow_create_streams, scopes
               FROM bureau.agent_links
               WHERE id = $1`,
              [cred.agent_link_id]
            )).rows as Array<{ agent_label: string; stream_ids: string[]; allow_create_streams: boolean; scopes: string[] }>
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
        type StreamRow = { id: string; name: string; category: string };
        let streamRows: StreamRow[];
        
        if (cred.agent_link_id && !(cred.allowed_stream_ids && cred.allowed_stream_ids.length > 0) && !cred.allow_create_streams) {
          // OAuth link with no streams and no create permission
          streamRows = [];
        } else {
          streamRows = await withUser(cred.user_id, cred.user_email, async (client) => {
            if (cred.allowed_stream_ids && cred.allowed_stream_ids.length > 0) {
              return (await client.query(
                `SELECT id, name, category FROM bureau.streams
                 WHERE workspace_id = $1 AND id = ANY($2)
                 ORDER BY name`,
                [cred.workspace_id, cred.allowed_stream_ids]
              )).rows as StreamRow[];
            }
            // Legacy token or allow_create_streams: list all
            return (await client.query(
              `SELECT id, name, category FROM bureau.streams
               WHERE workspace_id = $1
               ORDER BY name`,
              [cred.workspace_id]
            )).rows as StreamRow[];
          });
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
            `SELECT bureau.insert_ingest_log($1::uuid, $2::uuid, $3::uuid, $4::jsonb) as id`,
            [cred.workspace_id, cred.token_id, cred.agent_link_id, JSON.stringify(payload)]
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
      
      if (toolName === 'bureau_register_clone') {
        const { display_name, handle, vendor, timezone, working_hours, slack_handle } = toolArgs;
        
        if (!display_name || !handle || !vendor) {
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: 'Missing required parameters: display_name, handle, vendor'
            }
          } as MCPResponse);
        }
        
        // Check clone:write scope
        if (!cred.scopes.includes('clone:write')) {
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32603,
              message: 'Missing required scope: clone:write'
            }
          } as MCPResponse);
        }
        
        try {
          // Pass workspace_id and user_id from token, not from input
          const result = await query<{ register_clone: string }>(
            `SELECT bureau.register_clone($1, $2, $3, $4, $5, $6, 'v1', $7, $8, $9) as register_clone`,
            [cred.workspace_id, cred.user_id, cred.agent_link_id, display_name, handle, vendor, timezone, working_hours, slack_handle]
          );
          
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    clone_id: result[0].register_clone
                  }, null, 2)
                }
              ]
            }
          } as MCPResponse);
        } catch (error: any) {
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32603,
              message: error.message || 'Failed to register clone'
            }
          } as MCPResponse);
        }
      }
      
      if (toolName === 'bureau_update_profile') {
        const { clone_id: providedCloneId, responsibilities, active_work, decisions_pending, recent_output, availability } = toolArgs;
        
        // Resolve clone_id from agent_link if not provided
        let clone_id = providedCloneId;
        if (!clone_id && cred.agent_link_id) {
          const cloneRows = await withUser(cred.user_id, cred.user_email, async (client) =>
            (await client.query(
              `SELECT id FROM bureau.digital_clones WHERE agent_link_id = $1 LIMIT 1`,
              [cred.agent_link_id]
            )).rows as Array<{ id: string }>
          );
          if (cloneRows.length > 0) {
            clone_id = cloneRows[0].id;
          }
        }
        
        if (!clone_id) {
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: 'clone_id required or no clone found for this agent link'
            }
          } as MCPResponse);
        }
        
        // Check clone:write scope
        if (!cred.scopes.includes('clone:write')) {
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32603,
              message: 'Missing required scope: clone:write'
            }
          } as MCPResponse);
        }
        
        try {
          // Pass workspace_id and user_id from token first
          await query(
            `SELECT bureau.update_clone_profile($1, $2, $3, $4, $5, $6, $7, $8)`,
            [cred.workspace_id, cred.user_id, clone_id, responsibilities, active_work, decisions_pending, recent_output, availability]
          );
          
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ success: true }, null, 2)
                }
              ]
            }
          } as MCPResponse);
        } catch (error: any) {
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32603,
              message: error.message || 'Failed to update profile'
            }
          } as MCPResponse);
        }
      }
      
      if (toolName === 'bureau_post_heartbeat') {
        const { 
          clone_id: providedCloneId, date, top_priority, active, blocked, decisions_waiting_on_me,
          waiting_on_others, shipped_since_last, helping, out_of_office, confidence 
        } = toolArgs;
        
        // Resolve clone_id from agent_link if not provided
        let clone_id = providedCloneId;
        if (!clone_id && cred.agent_link_id) {
          const cloneRows = await withUser(cred.user_id, cred.user_email, async (client) =>
            (await client.query(
              `SELECT id FROM bureau.digital_clones WHERE agent_link_id = $1 LIMIT 1`,
              [cred.agent_link_id]
            )).rows as Array<{ id: string }>
          );
          if (cloneRows.length > 0) {
            clone_id = cloneRows[0].id;
          }
        }
        
        if (!clone_id || !date || !top_priority) {
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: clone_id ? 'Missing required parameters: date, top_priority' : 'clone_id required or no clone found for this agent link'
            }
          } as MCPResponse);
        }
        
        // Check clone:write scope
        if (!cred.scopes.includes('clone:write')) {
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32603,
              message: 'Missing required scope: clone:write'
            }
          } as MCPResponse);
        }
        
        try {
          // Pass workspace_id and user_id from token first
          await query(
            `SELECT bureau.post_clone_heartbeat($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [
              cred.workspace_id, cred.user_id, clone_id, date, top_priority, 
              active || [], 
              blocked || [], 
              decisions_waiting_on_me || [],
              waiting_on_others ? JSON.stringify(waiting_on_others) : '[]',
              shipped_since_last || [],
              helping ? JSON.stringify(helping) : '[]',
              out_of_office || false,
              confidence
            ]
          );
          
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ success: true }, null, 2)
                }
              ]
            }
          } as MCPResponse);
        } catch (error: any) {
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32603,
              message: error.message || 'Failed to post heartbeat'
            }
          } as MCPResponse);
        }
      }
      
      if (toolName === 'bureau_log_activity') {
        if (!cred.scopes.includes('clone:write')) return toolError(id, -32603, 'Missing required scope: clone:write');
        if (!activityKeyConfigured()) return toolError(id, -32603, 'Activity logging is not configured on this Bureau server yet');
        const request = typeof toolArgs.request === 'string' ? toolArgs.request : '';
        const personal = toolArgs.personal === true;
        if (!personal && !request.trim()) return toolError(id, -32602, 'Missing required parameter: request');
        try {
          const out = await withUser(cred.user_id, cred.user_email, async (client) => {
            let cloneId: string | null = null;
            let agentLabel: string | null = null;
            let vendor: string | null = null;
            if (cred.agent_link_id) {
              const rows = (await client.query(
                `SELECT l.agent_label, c.id AS clone_id, c.vendor::text AS vendor
                 FROM bureau.agent_links l
                 LEFT JOIN bureau.digital_clones c ON c.agent_link_id = l.id
                 WHERE l.id = $1 LIMIT 1`,
                [cred.agent_link_id]
              )).rows;
              cloneId = rows[0]?.clone_id ?? null;
              agentLabel = rows[0]?.agent_label ?? null;
              vendor = rows[0]?.vendor ?? null;
            }
            const logged = await logActivity(client, {
              workspaceId: cred.workspace_id,
              userId: cred.user_id,
              cloneId,
              agentLinkId: cred.agent_link_id,
              agentLabel,
              vendor,
              kind: toolArgs.kind === 'action' ? 'action' : 'request',
              request,
              detail: typeof toolArgs.detail === 'string' ? toolArgs.detail : null,
              conversationRef: typeof toolArgs.conversation_ref === 'string' ? toolArgs.conversation_ref : null,
              occurredAt: typeof toolArgs.occurred_at === 'string' ? toolArgs.occurred_at : null,
              personal,
            });
            // Feed the work-unit stitcher (never for personal requests). A failure here must not
            // lose the log entry, so it runs inside a savepoint.
            if (logged.status === 'logged' && !personal) {
              await client.query('SAVEPOINT gt_feed');
              try {
                const feed = await recordSignal(client, { workspaceId: cred.workspace_id, userId: cred.user_id }, agentSignal({
                  activityLogId: logged.id,
                  request,
                  detail: typeof toolArgs.detail === 'string' ? toolArgs.detail : null,
                  occurredAt: typeof toolArgs.occurred_at === 'string' ? toolArgs.occurred_at : null,
                  tool: agentToolName(toolArgs.tool, vendor, agentLabel),
                  project: toolArgs.project,
                  artifactUrl: toolArgs.artifact_url,
                }));
                await client.query('RELEASE SAVEPOINT gt_feed');
                if (feed.status === 'recorded') return { ...logged, work_event_id: feed.work_event_id };
              } catch {
                await client.query('ROLLBACK TO SAVEPOINT gt_feed');
              }
            }
            return logged;
          });
          if (out.status === 'consent_required') {
            const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://bureau-krustbuild.vercel.app';
            return toolText(id, {
              status: 'consent_required',
              message: `Nothing was logged. The user has not accepted Bureau's AI activity logging notice yet. Ask them once to open ${origin}/activity and accept it, then carry on helping.`,
            });
          }
          if (out.status === 'invalid') return toolError(id, -32602, out.message);
          return toolText(id, out);
        } catch (error: unknown) {
          if (error instanceof ActivityKeyError) return toolError(id, -32603, 'Activity logging is not configured on this Bureau server yet');
          return toolError(id, -32603, 'Failed to log activity');
        }
      }

      if (toolName === 'bureau_search_activity' || toolName === 'bureau_activity_timeline') {
        const denied = await activityDenied();
        if (denied) return toolError(id, -32603, denied);
        if (!activityKeyConfigured()) return toolError(id, -32603, 'Activity logging is not configured on this Bureau server yet');
        const isTimeline = toolName === 'bureau_activity_timeline';
        const who = typeof toolArgs.who === 'string' ? toolArgs.who.trim() : '';
        if (isTimeline && !who) return toolError(id, -32602, 'Missing required parameter: who');
        try {
          const out = await withUser(cred.user_id, cred.user_email, async (client) => {
            let userIds: string[] | null = null;
            let person: { display_name: string | null; handle: string | null; owner_email: string | null } | null = null;
            if (who) {
              const match = await lookupClone(client, cred.workspace_id, who);
              if (match.status !== 'found') return lookupNotFoundResult(who, match);
              userIds = [match.clone.owner_user_id];
              person = { display_name: match.clone.display_name, handle: match.clone.handle, owner_email: match.clone.owner_email };
            }
            let since: string | null = typeof toolArgs.since === 'string' ? toolArgs.since : null;
            const until: string | null = typeof toolArgs.until === 'string' ? toolArgs.until : null;
            let limit = Math.min(Math.max(Number(toolArgs.limit) || 25, 1), 100);
            if (isTimeline) {
              const days = Math.min(Math.max(Math.floor(Number(toolArgs.days) || 7), 1), ACTIVITY_RETENTION_DAYS);
              since = new Date(Date.now() - days * 86400_000).toISOString();
              limit = Math.min(Math.max(Number(toolArgs.limit) || 100, 1), 200);
            }
            const res = await listActivity(client, {
              workspaceId: cred.workspace_id,
              userIds,
              query: isTimeline ? null : (typeof toolArgs.query === 'string' ? toolArgs.query : null),
              since,
              until,
              limit,
            });
            return {
              status: 'ok',
              ...(person ? { who: person } : {}),
              count: res.entries.length,
              ...(res.truncated ? { note: 'Only the newest 2000 entries were searched; narrow with who/since/until.' } : {}),
              entries: res.entries.map(e => ({
                when: e.occurred_at,
                who: e.email,
                agent: e.agent_label,
                kind: e.kind,
                request: e.hidden ? '(hidden as personal)' : e.request,
                ...(e.detail ? { detail: e.detail } : {}),
              })),
            };
          });
          return toolText(id, out);
        } catch (error: unknown) {
          return toolError(id, -32603, 'Failed to read activity');
        }
      }

      if (toolName === 'bureau_work_board' || toolName === 'bureau_work_timeline' || toolName === 'bureau_work_digest') {
        const denied = await activityDenied();
        if (denied) return toolError(id, -32603, denied);
        if (!activityKeyConfigured()) return toolError(id, -32603, 'Activity logging is not configured on this Bureau server yet');
        const who = typeof toolArgs.who === 'string' ? toolArgs.who.trim() : '';
        if (toolName === 'bureau_work_timeline' && !who) return toolError(id, -32602, 'Missing required parameter: who');
        try {
          const out = await withUser(cred.user_id, cred.user_email, async (client) => {
            let userIds: string[] | null = null;
            let person: { display_name: string | null; handle: string | null; owner_email: string | null } | null = null;
            if (who) {
              const match = await lookupClone(client, cred.workspace_id, who);
              if (match.status !== 'found') return lookupNotFoundResult(who, match);
              userIds = [match.clone.owner_user_id];
              person = { display_name: match.clone.display_name, handle: match.clone.handle, owner_email: match.clone.owner_email };
            }
            const days = Math.min(Math.max(Math.floor(Number(toolArgs.days) || 7), 1), ACTIVITY_RETENTION_DAYS);
            if (toolName === 'bureau_work_board') {
              const board = await teamBoard(client, cred.workspace_id, { days, project: typeof toolArgs.project === 'string' ? toolArgs.project : null });
              return { status: 'ok', ...board };
            }
            if (toolName === 'bureau_work_digest') {
              const digest = await buildDigest(client, cred.workspace_id, toolArgs.period === 'weekly' ? 'weekly' : 'daily', userIds);
              return { status: 'ok', ...(person ? { who: person } : {}), ...digest };
            }
            const units = await listWorkUnits(client, {
              workspaceId: cred.workspace_id, userIds,
              since: new Date(Date.now() - days * 86400_000).toISOString(),
              verifiedOnly: toolArgs.verified_only === true, limit: 200,
            });
            return {
              status: 'ok', who: person, count: units.length,
              units: units.map(u => ({
                when: u.last_seen_at, started: u.started_at, project: u.project, task: u.task_type, status: u.status,
                title: u.hidden ? '(hidden as personal)' : u.title, link: u.artifact_link, tools: u.tools,
                confidence: u.confidence, ...(u.blocker ? { blocker: u.blocker } : {}), effort: u.effort,
              })),
            };
          });
          return toolText(id, out);
        } catch {
          return toolError(id, -32603, 'Failed to read work units');
        }
      }

      if (toolName === 'bureau_team_health') {
        const denied = await leaderDenied();
        if (denied) return toolError(id, -32603, denied);

        try {
          const result = await query<{ clone_id: string }>(
            `SELECT * FROM bureau.get_team_health($1)`,
            [cred.workspace_id]
          );
          const who = typeof toolArgs.who === 'string' ? toolArgs.who.trim() : '';
          if (!who) return toolText(id, result);

          const match = await withUser(cred.user_id, cred.user_email, (client) => lookupClone(client, cred.workspace_id, who));
          if (match.status !== 'found') return toolText(id, lookupNotFoundResult(who, match));
          const ids = new Set([match.clone.id, ...match.other_clones_of_same_person.map(c => c.id)]);
          return toolText(id, { status: 'found', who, clones: result.filter(r => ids.has(String(r.clone_id))) });
        } catch (error: any) {
          return toolError(id, -32603, error.message || 'Failed to get team health');
        }
      }

      if (toolName === 'bureau_ask_question') {
        const denied = await leaderDenied();
        if (denied) return toolError(id, -32603, denied);
        const who = typeof toolArgs.who === 'string' ? toolArgs.who.trim() : '';
        const questionText = typeof toolArgs.question_text === 'string' ? toolArgs.question_text.trim() : '';
        if (!who || !questionText) return toolError(id, -32602, 'Missing required parameters: who, question_text');
        if (questionText.length > 2000) return toolError(id, -32602, 'question_text must be at most 2000 characters');

        try {
          const out = await withUser(cred.user_id, cred.user_email, async (client) => {
            const match = await lookupClone(client, cred.workspace_id, who);
            if (match.status !== 'found') return lookupNotFoundResult(who, match);
            const askRows = await client.query(
              `SELECT bureau.ask_question($1, $2, $3, NULL, NULL, $4, NULL, 'mcp') AS question_id`,
              [cred.workspace_id, questionText, cred.user_id, match.clone.id]
            );
            const checkin = await latestCheckin(client, match.clone.id);
            return {
              status: 'asked',
              question_id: askRows.rows[0].question_id,
              asked: { handle: match.clone.handle, display_name: match.clone.display_name, owner_email: match.clone.owner_email },
              from_latest_checkin: checkin,
              note: checkin
                ? `Their latest check-in is from ${checkin.date}${checkin.days_old > 1 ? ` (${checkin.days_old} days old)` : ''}. The question stays open until their AI answers it; check with bureau_get_questions who="${match.clone.handle}".`
                : `They have not posted a check-in yet. The question stays open until their AI answers it; check with bureau_get_questions who="${match.clone.handle}".`,
            };
          });
          return toolText(id, out);
        } catch (error: any) {
          return toolError(id, -32603, error.message || 'Failed to ask question');
        }
      }

      if (toolName === 'bureau_get_questions') {
        const { clone_id: providedCloneId, status } = toolArgs;

        // Owners/admins: questions asked of a teammate (with answers), resolved by name
        if (typeof toolArgs.who === 'string' && toolArgs.who.trim()) {
          if (!cred.scopes.includes('questions:read')) return toolError(id, -32603, 'Missing required scope: questions:read');
          const denied = await leaderDenied();
          if (denied) return toolError(id, -32603, denied);
          const who = toolArgs.who.trim();
          const validStatus = ['open', 'answered', 'escalated', 'closed'].includes(status) ? status : null;
          try {
            const out = await withUser(cred.user_id, cred.user_email, async (client) => {
              const match = await lookupClone(client, cred.workspace_id, who);
              if (match.status !== 'found') return lookupNotFoundResult(who, match);
              const rows = (await client.query(
                `SELECT id, question_text, answer_text, status::text AS status, source::text AS source,
                        answered_by_clone, asked_at, answered_at, escalation_reason
                   FROM bureau.questions
                  WHERE workspace_id = $1 AND target_clone_id = $2 AND ($3::text IS NULL OR status::text = $3)
                  ORDER BY asked_at DESC
                  LIMIT 20`,
                [cred.workspace_id, match.clone.id, validStatus]
              )).rows;
              return { status: 'found', who: { handle: match.clone.handle, display_name: match.clone.display_name }, questions: rows };
            });
            return toolText(id, out);
          } catch (error: any) {
            return toolError(id, -32603, error.message || 'Failed to get questions');
          }
        }
        
        // Resolve clone_id from agent_link if not provided
        let clone_id = providedCloneId;
        if (!clone_id && cred.agent_link_id) {
          const cloneRows = await withUser(cred.user_id, cred.user_email, async (client) =>
            (await client.query(
              `SELECT id FROM bureau.digital_clones WHERE agent_link_id = $1 LIMIT 1`,
              [cred.agent_link_id]
            )).rows as Array<{ id: string }>
          );
          if (cloneRows.length > 0) {
            clone_id = cloneRows[0].id;
          }
        }
        
        if (!clone_id) {
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: 'clone_id required or no clone found for this agent link'
            }
          } as MCPResponse);
        }
        
        // Check questions:read scope
        if (!cred.scopes.includes('questions:read')) {
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32603,
              message: 'Missing required scope: questions:read'
            }
          } as MCPResponse);
        }
        
        try {
          // Pass workspace_id and user_id from token first
          const result = await query(
            `SELECT * FROM bureau.get_clone_questions($1, $2, $3, $4)`,
            [cred.workspace_id, cred.user_id, clone_id, status || null]
          );
          
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          } as MCPResponse);
        } catch (error: any) {
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32603,
              message: error.message || 'Failed to get questions'
            }
          } as MCPResponse);
        }
      }
      
      if (toolName === 'bureau_answer_question') {
        const { question_id, answer_text } = toolArgs;
        
        if (!question_id || !answer_text) {
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: 'Missing required parameters: question_id, answer_text'
            }
          } as MCPResponse);
        }
        
        // Check questions:write scope
        if (!cred.scopes.includes('questions:write')) {
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32603,
              message: 'Missing required scope: questions:write'
            }
          } as MCPResponse);
        }
        
        try {
          // Pass workspace_id and user_id from token first
          await query(
            `SELECT bureau.answer_question($1, $2, $3, $4, TRUE)`,
            [cred.workspace_id, cred.user_id, question_id, answer_text]
          );
          
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ success: true }, null, 2)
                }
              ]
            }
          } as MCPResponse);
        } catch (error: any) {
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32603,
              message: error.message || 'Failed to answer question'
            }
          } as MCPResponse);
        }
      }
      
      if (toolName === 'bureau_escalate_question') {
        const { question_id, escalation_reason } = toolArgs;
        
        if (!question_id || !escalation_reason) {
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: 'Missing required parameters: question_id, escalation_reason'
            }
          } as MCPResponse);
        }
        
        // Check questions:write scope
        if (!cred.scopes.includes('questions:write')) {
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32603,
              message: 'Missing required scope: questions:write'
            }
          } as MCPResponse);
        }
        
        try {
          // Pass workspace_id and user_id from token first
          await query(
            `SELECT bureau.escalate_question($1, $2, $3, $4)`,
            [cred.workspace_id, cred.user_id, question_id, escalation_reason]
          );
          
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ success: true }, null, 2)
                }
              ]
            }
          } as MCPResponse);
        } catch (error: any) {
          return NextResponse.json({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32603,
              message: error.message || 'Failed to escalate question'
            }
          } as MCPResponse);
        }
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
