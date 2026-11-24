/**
 * MCP Protocol Tests
 * Tests the full MCP protocol implementation
 */

import { describe, it, expect } from 'vitest';
import { POST as mcpHandler } from '../app/api/mcp/route';
import { NextRequest } from 'next/server';

describe('MCP Protocol', () => {
  it('should implement initialize handshake with protocol negotiation', async () => {
    const req = new NextRequest('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer bureau_test_token_12345'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          clientInfo: { name: 'test-client', version: '1.0.0' },
          capabilities: {}
        }
      })
    });

    const res = await mcpHandler(req);
    const data = await res.json();

    expect(data.jsonrpc).toBe('2.0');
    expect(data.id).toBe(1);
    expect(data.result.protocolVersion).toBe('2025-06-18');
    expect(data.result.serverInfo).toEqual({
      name: 'Bureau MCP Server',
      version: '1.0.0'
    });
    expect(data.result.capabilities).toEqual({ tools: {} });
  });

  it('should handle ping', async () => {
    // Test ping directly via POST
    const req = new NextRequest('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer bureau_test_token_12345'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'ping',
        params: {}
      })
    });

    const res = await mcpHandler(req);
    const data = await res.json();

    expect(data.jsonrpc).toBe('2.0');
    expect(data.id).toBe(1);
    expect(data.result).toEqual({});
  });

  it('should handle notifications/initialized with 202', async () => {
    const req = new NextRequest('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer bureau_test_token_12345'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {}
      })
    });

    const res = await mcpHandler(req);
    expect(res.status).toBe(202);
    
    // Response body should be empty for notification
    const text = await res.text();
    expect(text).toBe('');
  });

  it('should list tools', async () => {
    const req = new NextRequest('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer bureau_test_token_12345'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      })
    });

    const res = await mcpHandler(req);
    const data = await res.json();

    expect(data.jsonrpc).toBe('2.0');
    expect(data.id).toBe(2);
    expect(data.result).toHaveProperty('tools');
    expect(Array.isArray(data.result.tools)).toBe(true);
    expect(data.result.tools.length).toBeGreaterThan(0);
    
    // Check for expected tools
    const toolNames = data.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('bureau_register_clone');
    expect(toolNames).toContain('bureau_update_profile');
    expect(toolNames).toContain('bureau_get_questions');
  });

  it('should return 401 without Authorization header with WWW-Authenticate', async () => {
    const req = new NextRequest('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/list',
        params: {}
      })
    });

    const res = await mcpHandler(req);
    expect(res.status).toBe(401);
    
    const wwwAuth = res.headers.get('WWW-Authenticate');
    expect(wwwAuth).toBeTruthy();
    expect(wwwAuth).toContain('Bearer');
    expect(wwwAuth).toContain('resource_metadata');
    expect(wwwAuth).toContain('/.well-known/oauth-protected-resource');
  });

  it('should return JSON-RPC error for parse error', async () => {
    const req = new NextRequest('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer bureau_test_token_12345'
      },
      body: 'invalid json{'
    });

    const res = await mcpHandler(req);
    const data = await res.json();

    expect(data.jsonrpc).toBe('2.0');
    expect(data.id).toBe(null);
    expect(data.error).toEqual({
      code: -32700,
      message: 'Parse error'
    });
  });

  it('should fallback to latest protocol version if client version unsupported', async () => {
    const req = new NextRequest('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer bureau_test_token_12345'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'initialize',
        params: {
          protocolVersion: '2099-99-99',
          clientInfo: { name: 'test-client', version: '1.0.0' },
          capabilities: {}
        }
      })
    });

    const res = await mcpHandler(req);
    const data = await res.json();

    expect(data.result.protocolVersion).toBe('2025-06-18');
  });
});
