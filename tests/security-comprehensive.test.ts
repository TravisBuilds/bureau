/**
 * Comprehensive Security Tests (Items E, F, G)
 * Tests cross-workspace MCP isolation, Slack security, OAuth scope restrictions
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { POST as mcpHandler } from '../app/api/mcp/route';
import { POST as ingestHandler } from '../app/api/ingest/route';
import { POST as slackHandler } from '../app/api/slack/events/route';
import { NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';

const TEST_DB = {
  host: 'localhost',
  database: 'bureau_test',
  user: 'bureau_app',
  password: 'bureau_app_password',
  port: 5432,
};

describe('Comprehensive Security Tests', () => {
  let client: Client;
  let wsA: string, wsB: string;
  let userA: string, userB: string;
  let grantA: string, grantB: string;
  let linkA: string, linkB: string;
  let tokenA: string, tokenB: string;
  let cloneA: string, cloneB: string;
  let questionA: string;
  let streamX: string, streamY: string;
  let restrictedLink: string, restrictedToken: string;

  beforeAll(async () => {
    client = new Client(TEST_DB);
    await client.connect();

    // Setup test data
    const users = await client.query(`
      INSERT INTO auth.users (id, email) VALUES 
        (extensions.uuid_generate_v4(), 'usera@test.com'),
        (extensions.uuid_generate_v4(), 'userb@test.com')
      RETURNING id
    `);
    userA = users.rows[0].id;
    userB = users.rows[1].id;

    const ws = await client.query(`
      INSERT INTO bureau.workspaces (id, name, created_by) VALUES 
        (extensions.uuid_generate_v4(), 'Workspace A', $1),
        (extensions.uuid_generate_v4(), 'Workspace B', $2)
      RETURNING id
    `, [userA, userB]);
    wsA = ws.rows[0].id;
    wsB = ws.rows[1].id;

    await client.query(`
      INSERT INTO bureau.workspace_members (workspace_id, user_id, email, role, invited_by, invited_at, joined_at) VALUES 
        ($1, $2, 'usera@test.com', 'owner', $2, NOW(), NOW()),
        ($3, $4, 'userb@test.com', 'owner', $4, NOW(), NOW())
    `, [wsA, userA, wsB, userB]);

    // Create OAuth clients
    await client.query(`
      INSERT INTO bureau.oauth_clients (client_id, client_name, redirect_uris, registration, vendor) VALUES 
        ('client-a', 'Client A', ARRAY['http://localhost'], 'static', 'cursor'),
        ('client-b', 'Client B', ARRAY['http://localhost'], 'static', 'cursor')
    `);

    // Create OAuth grants
    const grants = await client.query(`
      INSERT INTO bureau.oauth_grants (id, workspace_id, user_id, client_id, scopes) VALUES 
        (extensions.uuid_generate_v4(), $1, $2, 'client-a', ARRAY['clone:write', 'questions:read', 'questions:write', 'ingest:write']),
        (extensions.uuid_generate_v4(), $3, $4, 'client-b', ARRAY['clone:write', 'questions:read', 'questions:write', 'ingest:write'])
      RETURNING id, workspace_id
    `, [wsA, userA, wsB, userB]);
    grantA = grants.rows.find(r => r.workspace_id === wsA).id;
    grantB = grants.rows.find(r => r.workspace_id === wsB).id;

    // Create agent_links
    const links = await client.query(`
      INSERT INTO bureau.agent_links (id, workspace_id, grant_id, agent_label, scopes, allow_create_streams) VALUES 
        (extensions.uuid_generate_v4(), $1, $2, 'Agent A', ARRAY['clone:write', 'questions:read', 'questions:write', 'ingest:write'], true),
        (extensions.uuid_generate_v4(), $3, $4, 'Agent B', ARRAY['clone:write', 'questions:read', 'questions:write', 'ingest:write'], true)
      RETURNING id, workspace_id
    `, [wsA, grantA, wsB, grantB]);
    linkA = links.rows.find(r => r.workspace_id === wsA).id;
    linkB = links.rows.find(r => r.workspace_id === wsB).id;

    // Create OAuth tokens
    tokenA = 'bureau_at_testTokenA123';
    tokenB = 'bureau_at_testTokenB456';
    await client.query(`
      INSERT INTO bureau.oauth_tokens (token_hash, token_prefix, kind, grant_id, expires_at) VALUES 
        (extensions.digest($1, 'sha256'), 'bureau_at_', 'access', $2, NOW() + INTERVAL '1 hour'),
        (extensions.digest($3, 'sha256'), 'bureau_at_', 'access', $4, NOW() + INTERVAL '1 hour')
    `, [tokenA, grantA, tokenB, grantB]);

    // Create clones
    const clones = await client.query(`
      SELECT bureau.register_clone($1, $2, $3, 'Clone A', 'clonea', 'cursor', 'v1', NULL, NULL, NULL) as id
      UNION ALL
      SELECT bureau.register_clone($4, $5, $6, 'Clone B', 'cloneb', 'cursor', 'v1', NULL, NULL, NULL)
    `, [wsA, userA, linkA, wsB, userB, linkB]);
    cloneA = clones.rows[0].id;
    cloneB = clones.rows[1].id;

    // Create question
    const questions = await client.query(`
      SELECT bureau.ask_question($1, 'Test question', $2, NULL, NULL, $3, NULL, 'web') as id
    `, [wsA, userA, cloneA]);
    questionA = questions.rows[0].id;

    // Create streams
    const streams = await client.query(`
      INSERT INTO bureau.streams (id, workspace_id, name, category, description) VALUES 
        (extensions.uuid_generate_v4(), $1, 'Stream X', 'production', 'Test X'),
        (extensions.uuid_generate_v4(), $1, 'Stream Y', 'production', 'Test Y')
      RETURNING id
    `, [wsA]);
    streamX = streams.rows[0].id;
    streamY = streams.rows[1].id;

    // Create restricted agent_link (only streamX, no create)
    // Use a different client to avoid unique constraint on (workspace_id, user_id, client_id)
    await client.query(`
      INSERT INTO bureau.oauth_clients (client_id, client_name, redirect_uris, registration, vendor) VALUES 
        ('client-restricted', 'Restricted Client', ARRAY['http://localhost'], 'static', 'cursor')
      ON CONFLICT DO NOTHING
    `);
    
    const restrictedGrant = await client.query(`
      INSERT INTO bureau.oauth_grants (id, workspace_id, user_id, client_id, scopes) VALUES 
        (extensions.uuid_generate_v4(), $1, $2, 'client-restricted', ARRAY['ingest:write'])
      RETURNING id
    `, [wsA, userA]);
    
    const restrictedLinkRes = await client.query(`
      INSERT INTO bureau.agent_links (id, workspace_id, grant_id, agent_label, scopes, stream_ids, allow_create_streams) VALUES 
        (extensions.uuid_generate_v4(), $1, $2, 'Restricted', ARRAY['ingest:write'], ARRAY[$3::uuid], false)
      RETURNING id
    `, [wsA, restrictedGrant.rows[0].id, streamX]);
    restrictedLink = restrictedLinkRes.rows[0].id;

    restrictedToken = 'bureau_at_restricted789';
    await client.query(`
      INSERT INTO bureau.oauth_tokens (token_hash, token_prefix, kind, grant_id, expires_at) VALUES 
        (extensions.digest($1, 'sha256'), 'bureau_at_', 'access', $2, NOW() + INTERVAL '1 hour')
    `, [restrictedToken, restrictedGrant.rows[0].id]);
  });

  afterAll(async () => {
    await client.query('DELETE FROM bureau.workspaces WHERE id IN ($1, $2)', [wsA, wsB]);
    await client.query('DELETE FROM auth.users WHERE id IN ($1, $2)', [userA, userB]);
    await client.query('DELETE FROM bureau.oauth_clients WHERE client_id IN ($1, $2)', ['client-a', 'client-b']);
    await client.end();
  });

  // G.1: Cross-workspace rejection for each MCP tool
  describe('MCP Cross-Workspace Isolation', () => {
    it('should reject update_profile from workspace A on clone B', async () => {
      const req = new NextRequest('http://localhost/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenA}`
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'bureau_update_profile',
            arguments: {
              clone_id: cloneB,
              responsibilities: 'Hacked'
            }
          }
        })
      });

      const res = await mcpHandler(req);
      const data = await res.json();
      
      expect(data.error).toBeTruthy();
      expect(data.error.message).toContain('not found');
    });

    it('should reject post_heartbeat from workspace A on clone B', async () => {
      const req = new NextRequest('http://localhost/api/mcp', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'bureau_post_heartbeat',
            arguments: { clone_id: cloneB, date: '2026-11-24', top_priority: 'Hack' }
          }
        })
      });

      const res = await mcpHandler(req);
      const data = await res.json();
      expect(data.error).toBeTruthy();
    });

    it('should reject get_questions from workspace A for clone B', async () => {
      const req = new NextRequest('http://localhost/api/mcp', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'bureau_get_questions', arguments: { clone_id: cloneB } }
        })
      });

      const res = await mcpHandler(req);
      const data = await res.json();
      // Should return empty or error
      expect(data.result?.content?.[0]?.text === '[]' || data.error).toBeTruthy();
    });

    it('should reject answer_question from workspace A for question in workspace B', async () => {
      // Create question in workspace B
      const qB = await client.query(`
        SELECT bureau.ask_question($1, 'B question', $2, NULL, NULL, $3, NULL, 'web') as id
      `, [wsB, userB, cloneB]);

      const req = new NextRequest('http://localhost/api/mcp', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: { name: 'bureau_answer_question', arguments: { question_id: qB.rows[0].id, answer_text: 'Hack' } }
        })
      });

      const res = await mcpHandler(req);
      const data = await res.json();
      expect(data.error).toBeTruthy();
    });

    it('should reject escalate_question from workspace A for question in workspace B', async () => {
      const qB = await client.query(`
        SELECT bureau.ask_question($1, 'B question 2', $2, NULL, NULL, $3, NULL, 'web') as id
      `, [wsB, userB, cloneB]);

      const req = new NextRequest('http://localhost/api/mcp', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: { name: 'bureau_escalate_question', arguments: { question_id: qB.rows[0].id, escalation_reason: 'Test' } }
        })
      });

      const res = await mcpHandler(req);
      const data = await res.json();
      expect(data.error).toBeTruthy();
    });
  });

  // G.2: Stream restrictions in /api/ingest
  describe('Ingest Stream Restrictions', () => {
    it('should reject ingest to disallowed stream Y', async () => {
      const req = new NextRequest('http://localhost/api/ingest', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${restrictedToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'intake',
          stream: streamY,
          content: 'Test'
        })
      });

      const res = await ingestHandler(req);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should reject stream creation when not allowed', async () => {
      const req = new NextRequest('http://localhost/api/ingest', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${restrictedToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'intake',
          stream: 'new-stream-attempt',
          content: 'Test'
        })
      });

      const res = await ingestHandler(req);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should allow ingest to allowed stream X', async () => {
      const req = new NextRequest('http://localhost/api/ingest', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${restrictedToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'intake',
          stream: streamX,
          content: 'Allowed test'
        })
      });

      const res = await ingestHandler(req);
      expect(res.status).toBeLessThan(400);
    });
  });

  // G.3: Slack signature tests
  describe('Slack Signature Validation', () => {
    const SLACK_SECRET = 'test_secret_12345';
    
    function signPayload(body: string, timestamp: string): string {
      const hmac = createHmac('sha256', SLACK_SECRET);
      hmac.update(`v0:${timestamp}:${body}`);
      return `v0=${hmac.digest('hex')}`;
    }

    beforeAll(() => {
      process.env.SLACK_SIGNING_SECRET = SLACK_SECRET;
      process.env.SLACK_BOT_TOKEN = 'xoxb-test';
    });

    it('should accept valid Slack signature', async () => {
      const body = JSON.stringify({ type: 'url_verification', challenge: 'test123' });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = signPayload(body, timestamp);

      const req = new NextRequest('http://localhost/api/slack/events', {
        method: 'POST',
        headers: {
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': signature,
          'Content-Type': 'application/json'
        },
        body
      });

      const res = await slackHandler(req);
      expect(res.status).toBe(200);
    });

    it('should reject invalid Slack signature', async () => {
      const body = JSON.stringify({ type: 'url_verification', challenge: 'test123' });
      const timestamp = Math.floor(Date.now() / 1000).toString();

      const req = new NextRequest('http://localhost/api/slack/events', {
        method: 'POST',
        headers: {
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': 'v0=wrong_signature',
          'Content-Type': 'application/json'
        },
        body
      });

      const res = await slackHandler(req);
      expect(res.status).toBe(401);
    });

    it('should reject signature with length mismatch', async () => {
      const body = JSON.stringify({ type: 'url_verification', challenge: 'test123' });
      const timestamp = Math.floor(Date.now() / 1000).toString();

      const req = new NextRequest('http://localhost/api/slack/events', {
        method: 'POST',
        headers: {
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': 'v0=short',
          'Content-Type': 'application/json'
        },
        body
      });

      const res = await slackHandler(req);
      expect(res.status).toBe(401);
    });

    it('should reject old timestamp (>5min)', async () => {
      const body = JSON.stringify({ type: 'url_verification', challenge: 'test123' });
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString(); // 6+ minutes ago
      const signature = signPayload(body, oldTimestamp);

      const req = new NextRequest('http://localhost/api/slack/events', {
        method: 'POST',
        headers: {
          'x-slack-request-timestamp': oldTimestamp,
          'x-slack-signature': signature,
          'Content-Type': 'application/json'
        },
        body
      });

      const res = await slackHandler(req);
      expect(res.status).toBe(401);
    });
  });
});
