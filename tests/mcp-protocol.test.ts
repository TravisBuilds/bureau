/**
 * MCP protocol tests against the real /api/mcp handler with a real OAuth token
 * (grant -> agent_link -> hex-sha256 access token), app running as bureau_app.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { admin, cleanup, createWorkspace, createOAuthToken } from './helpers/clone-fixtures';

let mcpPost: any, mcpAliasPost: any, token: string;

const call = (body: any, auth: string | null = `Bearer ${token}`, raw = false) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth) headers.authorization = auth;
  return mcpPost(new NextRequest('http://localhost:3000/api/mcp', {
    method: 'POST', headers, body: raw ? body : JSON.stringify(body),
  }));
};

beforeAll(async () => {
  ({ POST: mcpPost } = await import('../app/api/mcp/route'));
  ({ POST: mcpAliasPost } = await import('../app/mcp/route'));
  const ws = await createWorkspace('mcp-proto');
  token = (await createOAuthToken({ workspaceId: ws.id, userId: ws.owner.userId })).token;
});
afterAll(async () => { await cleanup(); await admin.end(); });

describe('MCP protocol', () => {
  it('/mcp re-exports the same POST handler', () => {
    expect(mcpAliasPost).toBe(mcpPost);
  });

  it('initialize negotiates a supported protocol version', async () => {
    const res = await call({ jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-06-18', clientInfo: { name: 't', version: '1' }, capabilities: {} } });
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d).toMatchObject({ jsonrpc: '2.0', id: 1 });
    expect(d.result.protocolVersion).toBe('2025-06-18');
    expect(d.result.serverInfo).toEqual({ name: 'Bureau MCP Server', version: '1.0.0' });
    expect(d.result.capabilities).toEqual({ tools: {} });
  });

  it('initialize falls back to the latest version for an unknown one', async () => {
    const d = await (await call({ jsonrpc: '2.0', id: 4, method: 'initialize', params: { protocolVersion: '2099-99-99' } })).json();
    expect(d.result.protocolVersion).toBe('2025-06-18');
  });

  it('notifications/initialized -> 202 with empty body', async () => {
    const res = await call({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('');
  });

  it('ping -> empty result', async () => {
    expect(await (await call({ jsonrpc: '2.0', id: 2, method: 'ping', params: {} })).json())
      .toEqual({ jsonrpc: '2.0', id: 2, result: {} });
  });

  it('tools/list returns all 17 Bureau tools with input schemas', async () => {
    const d = await (await call({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} })).json();
    const names = d.result.tools.map((t: any) => t.name).sort();
    expect(names).toEqual([
      'bureau_activity_timeline', 'bureau_answer_question', 'bureau_ask_question', 'bureau_escalate_question', 'bureau_get_questions',
      'bureau_list_streams', 'bureau_log_activity', 'bureau_post_heartbeat', 'bureau_register_clone', 'bureau_report_cost',
      'bureau_search_activity', 'bureau_team_health', 'bureau_update_profile', 'bureau_whoami',
      'bureau_work_board', 'bureau_work_digest', 'bureau_work_timeline',
    ]);
    for (const t of d.result.tools) expect(t.inputSchema?.type).toBe('object');
  });

  it('tools/call bureau_whoami works with the real token', async () => {
    const d = await (await call({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'bureau_whoami', arguments: {} } })).json();
    expect(d.error).toBeUndefined();
    expect(d.result.content[0].type).toBe('text');
  });

  it('unknown method -> -32601', async () => {
    const d = await (await call({ jsonrpc: '2.0', id: 6, method: 'nope/nope', params: {} })).json();
    expect(d.error.code).toBe(-32601);
  });

  it('malformed JSON (authenticated) -> -32700', async () => {
    const d = await (await call('{not json', `Bearer ${token}`, true)).json();
    expect(d).toMatchObject({ jsonrpc: '2.0', id: null, error: { code: -32700 } });
  });

  it('missing Authorization -> 401 with RFC 9728 WWW-Authenticate', async () => {
    const res = await call({ jsonrpc: '2.0', id: 7, method: 'initialize', params: {} }, null);
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toMatch(/^Bearer realm="https?:\/\/[^"]+\/mcp", resource_metadata="https?:\/\/[^"]+\/\.well-known\/oauth-protected-resource"$/);
  });

  it('invalid token -> 401 with absolute resource_metadata', async () => {
    const res = await call({ jsonrpc: '2.0', id: 8, method: 'initialize', params: {} }, 'Bearer bureau_at_not_a_real_token');
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe(
      'Bearer realm="http://localhost:3000/mcp", resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource"');
  });
});
