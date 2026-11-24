/**
 * Comprehensive Clone Security Tests
 * Tests MCP, Ingest, Web Routes, and Slack with real route handlers
 */

import { describe, test, expect, beforeAll, vi } from 'vitest';
import { Pool } from 'pg';
import crypto from 'crypto';
import { POST as mcpPost } from '../app/api/mcp/route';
import { POST as ingestPost } from '../app/api/ingest/route';
import { POST as slackPost } from '../app/api/slack/events/route';
import { GET as clonesGet } from '../app/api/clones/route';
import { GET as questionsGet } from '../app/api/questions/route';
import { GET as membersGet } from '../app/api/team/members/route';

// Connect as postgres for seeding
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'bureau_test_final',
  user: 'postgres',
  password: 'postgres_test'
});

// Test fixtures
let wsA: string, wsB: string;
let userA: string, userB: string;
let cloneA: string, cloneB: string;
let tokenA: string, tokenB: string;
let agentLinkA: string;
let streamX: string;

beforeAll(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Users
    const users = await client.query(`
      INSERT INTO auth.users (id, email) VALUES
        (extensions.uuid_generate_v4(), 'usera@test.com'),
        (extensions.uuid_generate_v4(), 'userb@test.com')
      RETURNING id
    `);
    userA = users.rows[0].id;
    userB = users.rows[1].id;
    
    // Workspaces
    const ws = await client.query(`
      INSERT INTO bureau.workspaces (id, name, created_by) VALUES
        (extensions.uuid_generate_v4(), 'Workspace A', $1),
        (extensions.uuid_generate_v4(), 'Workspace B', $2)
      RETURNING id
    `, [userA, userB]);
    wsA = ws.rows[0].id;
    wsB = ws.rows[1].id;
    
    // Members
    await client.query(`
      INSERT INTO bureau.workspace_members (workspace_id, user_id, email, role, joined_at, invited_at)
      VALUES 
        ($1, $2, 'usera@test.com', 'owner', NOW(), NOW()),
        ($3, $4, 'userb@test.com', 'owner', NOW(), NOW())
    `, [wsA, userA, wsB, userB]);
    
    // Agent link
    const link = await client.query(`
      INSERT INTO bureau.agent_links (id, workspace_id, label, created_at)
      VALUES (extensions.uuid_generate_v4(), $1, 'Link A', NOW())
      RETURNING id
    `, [wsA]);
    agentLinkA = link.rows[0].id;
    
    // Tokens (hex-encoded SHA-256)
    tokenA = `bureau_at_${crypto.randomBytes(32).toString('hex')}`;
    tokenB = `bureau_at_${crypto.randomBytes(32).toString('hex')}`;
    const hashA = crypto.createHash('sha256').update(tokenA).digest('hex');
    const hashB = crypto.createHash('sha256').update(tokenB).digest('hex');
    
    await client.query(`
      INSERT INTO bureau.oauth_tokens (token_hash, agent_link_id, scopes, expires_at, created_at)
      VALUES 
        ($1, $2, ARRAY['clone:write', 'questions:read', 'questions:write', 'ingest:write'], NOW() + INTERVAL '1 year', NOW()),
        ($3, NULL, ARRAY['clone:write'], NOW() + INTERVAL '1 year', NOW())
    `, [hashA, agentLinkA, hashB]);
    
    // Clones
    const clones = await client.query(`
      INSERT INTO bureau.digital_clones (id, workspace_id, owner_user_id, handle, display_name, vendor)
      VALUES 
        (extensions.uuid_generate_v4(), $1, $2, 'alpha', 'Clone Alpha', 'openai'),
        (extensions.uuid_generate_v4(), $3, $4, 'beta', 'Clone Beta', 'anthropic')
      RETURNING id
    `, [wsA, userA, wsB, userB]);
    cloneA = clones.rows[0].id;
    cloneB = clones.rows[1].id;
    
    // Stream
    const stream = await client.query(`
      INSERT INTO bureau.streams (id, workspace_id, name) 
      VALUES (extensions.uuid_generate_v4(), $1, 'stream-x')
      RETURNING id
    `, [wsA]);
    streamX = stream.rows[0].id;
    
    // Grant stream to agentLinkA
    await client.query(`
      UPDATE bureau.agent_links 
      SET allowed_stream_ids = ARRAY[$1]::uuid[]
      WHERE id = $2
    `, [streamX, agentLinkA]);
    
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

describe('MCP Route', () => {
  test('initialize handshake', async () => {
    const req = new Request('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', params: { protocolVersion: '2024-11-05', clientInfo: { name: 'test', version: '1.0' } }, id: 1 })
    });
    const res = await mcpPost(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result.protocolVersion).toBe('2024-11-05');
  });

  test('tools/list returns MCP tools', async () => {
    const req = new Request('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', params: {}, id: 2 })
    });
    const res = await mcpPost(req);
    const json = await res.json();
    expect(json.result.tools).toBeDefined();
    expect(json.result.tools.length).toBeGreaterThan(0);
  });

  test('bureau_update_profile: own workspace succeeds', async () => {
    const req = new Request('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'bureau_update_profile',
          arguments: { clone_id: cloneA, profile: { bio: 'Test bio' } }
        },
        id: 3
      })
    });
    const res = await mcpPost(req);
    const json = await res.json();
    expect(json.result).toBeDefined();
    expect(json.error).toBeUndefined();
  });

  test('bureau_update_profile: workspace-B rejection', async () => {
    const req = new Request('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'bureau_update_profile',
          arguments: { clone_id: cloneB, profile: { bio: 'Evil' } }
        },
        id: 4
      })
    });
    const res = await mcpPost(req);
    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(json.error.message).toContain('not found');
  });

  test('bureau_post_heartbeat: own workspace succeeds', async () => {
    const req = new Request('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'bureau_post_heartbeat',
          arguments: { clone_id: cloneA, content: { status: 'working' } }
        },
        id: 5
      })
    });
    const res = await mcpPost(req);
    const json = await res.json();
    expect(json.result).toBeDefined();
  });

  test('bureau_post_heartbeat: workspace-B rejection', async () => {
    const req = new Request('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'bureau_post_heartbeat',
          arguments: { clone_id: cloneB, content: { status: 'evil' } }
        },
        id: 6
      })
    });
    const res = await mcpPost(req);
    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(json.error.message).toContain('not found');
  });
});

describe('Ingest Route', () => {
  test('allowed stream: 200 and status pending', async () => {
    const req = new Request('http://localhost:3000/api/ingest', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'cost', stream: 'stream-x', content: 'test' })
    });
    const res = await ingestPost(req);
    expect(res.status).toBe(200);
    
    // Check status is 'pending'
    const client = await pool.connect();
    try {
      const log = await client.query(`SELECT status FROM bureau.ingest_log ORDER BY created_at DESC LIMIT 1`);
      expect(log.rows[0].status).toBe('pending');
    } finally {
      client.release();
    }
  });

  test('disallowed stream: 403', async () => {
    const req = new Request('http://localhost:3000/api/ingest', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'cost', stream: 'stream-y', content: 'test' })
    });
    const res = await ingestPost(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain('not in allowed list');
  });

  test('create-disabled: 403', async () => {
    // Update agent_link to disable stream creation
    const client = await pool.connect();
    try {
      await client.query(`UPDATE bureau.agent_links SET allow_create_streams = false WHERE id = $1`, [agentLinkA]);
    } finally {
      client.release();
    }
    
    const req = new Request('http://localhost:3000/api/ingest', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'cost', stream: 'new-stream', content: 'test' })
    });
    const res = await ingestPost(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain('cannot create streams');
  });
});

describe('Web Routes', () => {
  test('GET /api/clones returns rows for active member', async () => {
    // Mock requireAuth
    vi.mock('@/lib/auth-helpers', () => ({
      requireAuth: vi.fn().mockResolvedValue({ id: userA, email: 'usera@test.com', workspaceId: wsA })
    }));
    
    const req = new Request('http://localhost:3000/api/clones', { method: 'GET' });
    const res = await clonesGet(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.clones.length).toBeGreaterThan(0);
  });

  test('GET /api/questions returns rows for active member', async () => {
    const req = new Request('http://localhost:3000/api/questions', { method: 'GET' });
    const res = await questionsGet(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.questions).toBeDefined();
  });

  test('GET /api/team/members returns rows for active member', async () => {
    const req = new Request('http://localhost:3000/api/team/members', { method: 'GET' });
    const res = await membersGet(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.members).toBeDefined();
  });
});

describe('Slack Route', () => {
  const computeSignature = (body: string, timestamp: string) => {
    const sigBasestring = `v0:${timestamp}:${body}`;
    const hmac = crypto.createHmac('sha256', process.env.SLACK_SIGNING_SECRET || 'test_secret');
    hmac.update(sigBasestring);
    return `v0=${hmac.digest('hex')}`;
  };

  beforeAll(() => {
    // Mock fetch for chat.postMessage
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    process.env.SLACK_SIGNING_SECRET = 'test_secret';
    
    // Create Slack installation
    pool.query(`
      INSERT INTO bureau.slack_installations (workspace_id, team_id, installed_at)
      VALUES ($1, 'team-a', NOW())
      ON CONFLICT (team_id) DO NOTHING
    `, [wsA]);
  });

  test('valid event creates 1 question', async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({
      type: 'event_callback',
      event_id: 'evt-test-1',
      team_id: 'team-a',
      event: { type: 'app_mention', text: '<@BOT> ask alpha test question', user: 'U123', channel: 'C123', ts: '123.456' }
    });
    const signature = computeSignature(body, timestamp);
    
    const req = new Request('http://localhost:3000/api/slack/events', {
      method: 'POST',
      headers: {
        'x-slack-signature': signature,
        'x-slack-request-timestamp': timestamp,
        'content-type': 'application/json'
      },
      body
    });
    const res = await slackPost(req);
    expect(res.status).toBe(200);
    
    // Check question created
    const client = await pool.connect();
    try {
      const qs = await client.query(`SELECT COUNT(*) FROM bureau.questions WHERE question_text = 'test question'`);
      expect(parseInt(qs.rows[0].count)).toBeGreaterThan(0);
    } finally {
      client.release();
    }
  });

  test('duplicate event_id creates 0 questions', async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({
      type: 'event_callback',
      event_id: 'evt-test-1', // Same as above
      team_id: 'team-a',
      event: { type: 'app_mention', text: '<@BOT> ask alpha dupe', user: 'U123', channel: 'C123', ts: '123.457' }
    });
    const signature = computeSignature(body, timestamp);
    
    const req = new Request('http://localhost:3000/api/slack/events', {
      method: 'POST',
      headers: { 'x-slack-signature': signature, 'x-slack-request-timestamp': timestamp, 'content-type': 'application/json' },
      body
    });
    const res = await slackPost(req);
    expect(res.status).toBe(200);
    
    const client = await pool.connect();
    try {
      const qs = await client.query(`SELECT COUNT(*) FROM bureau.questions WHERE question_text = 'dupe'`);
      expect(parseInt(qs.rows[0].count)).toBe(0);
    } finally {
      client.release();
    }
  });

  test('retry header creates 0 questions', async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({
      type: 'event_callback',
      event_id: 'evt-retry',
      team_id: 'team-a',
      event: { type: 'app_mention', text: '<@BOT> ask alpha retry', user: 'U123', channel: 'C123', ts: '123.458' }
    });
    const signature = computeSignature(body, timestamp);
    
    const req = new Request('http://localhost:3000/api/slack/events', {
      method: 'POST',
      headers: {
        'x-slack-signature': signature,
        'x-slack-request-timestamp': timestamp,
        'x-slack-retry-num': '1',
        'content-type': 'application/json'
      },
      body
    });
    const res = await slackPost(req);
    expect(res.status).toBe(200);
    
    const client = await pool.connect();
    try {
      const qs = await client.query(`SELECT COUNT(*) FROM bureau.questions WHERE question_text = 'retry'`);
      expect(parseInt(qs.rows[0].count)).toBe(0);
    } finally {
      client.release();
    }
  });

  test('team-A naming WS-B handle creates 0 questions', async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({
      type: 'event_callback',
      event_id: 'evt-cross',
      team_id: 'team-a',
      event: { type: 'app_mention', text: '<@BOT> ask beta cross workspace', user: 'U123', channel: 'C123', ts: '123.459' }
    });
    const signature = computeSignature(body, timestamp);
    
    const req = new Request('http://localhost:3000/api/slack/events', {
      method: 'POST',
      headers: { 'x-slack-signature': signature, 'x-slack-request-timestamp': timestamp, 'content-type': 'application/json' },
      body
    });
    const res = await slackPost(req);
    expect(res.status).toBe(200);
    
    const client = await pool.connect();
    try {
      const qs = await client.query(`SELECT COUNT(*) FROM bureau.questions WHERE question_text = 'cross workspace'`);
      expect(parseInt(qs.rows[0].count)).toBe(0);
    } finally {
      client.release();
    }
  });

  test('bad signature: 401', async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({ type: 'event_callback', event_id: 'evt-bad' });
    
    const req = new Request('http://localhost:3000/api/slack/events', {
      method: 'POST',
      headers: { 'x-slack-signature': 'v0=badsig', 'x-slack-request-timestamp': timestamp, 'content-type': 'application/json' },
      body
    });
    const res = await slackPost(req);
    expect(res.status).toBe(401);
  });

  test('signature length mismatch: 401', async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({ type: 'event_callback' });
    
    const req = new Request('http://localhost:3000/api/slack/events', {
      method: 'POST',
      headers: { 'x-slack-signature': 'v0=short', 'x-slack-request-timestamp': timestamp, 'content-type': 'application/json' },
      body
    });
    const res = await slackPost(req);
    expect(res.status).toBe(401);
  });

  test('old timestamp: 401', async () => {
    const oldTimestamp = Math.floor(Date.now() / 1000 - 400).toString(); // 400 seconds ago
    const body = JSON.stringify({ type: 'event_callback' });
    const signature = computeSignature(body, oldTimestamp);
    
    const req = new Request('http://localhost:3000/api/slack/events', {
      method: 'POST',
      headers: { 'x-slack-signature': signature, 'x-slack-request-timestamp': oldTimestamp, 'content-type': 'application/json' },
      body
    });
    const res = await slackPost(req);
    expect(res.status).toBe(401);
  });
});
