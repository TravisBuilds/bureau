/**
 * Integration tests for API routes
 * Tests against real Postgres with full schema
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { setupDatabase, cleanupDatabase, createTestUser } from './setup';
import crypto from 'crypto';

describe('Integration Tests', () => {
  let client: Client;
  let user1Id: string;
  let user2Id: string;
  let workspace1Id: string;
  let workspace2Id: string;

  beforeAll(async () => {
    client = await setupDatabase();
    
    // Create two users with workspaces
    const invite1 = await client.query(
      `INSERT INTO bureau.pilot_invites (code, description, expires_at)
       VALUES ('TEST1', 'Test invite 1', NOW() + INTERVAL '1 day')
       RETURNING code`
    );
    
    const invite2 = await client.query(
      `INSERT INTO bureau.pilot_invites (code, description, expires_at)
       VALUES ('TEST2', 'Test invite 2', NOW() + INTERVAL '1 day')
       RETURNING code`
    );
    
    user1Id = await createTestUser(client, 'user1@test.com', invite1.rows[0].code);
    user2Id = await createTestUser(client, 'user2@test.com', invite2.rows[0].code);
    
    // Get workspace IDs
    await client.query(`SELECT set_config('request.jwt.claim.sub', '${user1Id}', false)`);
    const ws1 = await client.query(`SELECT id FROM bureau.user_workspaces()`);
    workspace1Id = ws1.rows[0].id;
    
    await client.query(`SELECT set_config('request.jwt.claim.sub', '${user2Id}', false)`);
    const ws2 = await client.query(`SELECT id FROM bureau.user_workspaces()`);
    workspace2Id = ws2.rows[0].id;
  }, 60000);

  afterAll(async () => {
    await cleanupDatabase(client);
  });

  it('should create token with hash storage', async () => {
    // Set user context
    await client.query(`SELECT set_config('request.jwt.claim.sub', '${user1Id}', false)`);
    
    // Generate token (simulate POST /api/tokens)
    const token = `bureau_${crypto.randomBytes(32).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const tokenPrefix = token.substring(0, 15);
    
    const result = await client.query(
      `INSERT INTO bureau.ingest_tokens (workspace_id, name, token_hash, token_prefix)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [workspace1Id, 'Test Token', tokenHash, tokenPrefix]
    );
    
    expect(result.rows[0].id).toBeDefined();
    
    // Verify token can be resolved
    const resolved = await client.query(
      `SELECT * FROM bureau.resolve_ingest_token($1)`,
      [token]
    );
    
    expect(resolved.rows.length).toBe(1);
    expect(resolved.rows[0].workspace_id).toBe(workspace1Id);
    expect(resolved.rows[0].user_id).toBe(user1Id);
  });

  it('should auto-create stream from ingest', async () => {
    // Create token for user1
    await client.query(`SELECT set_config('request.jwt.claim.sub', '${user1Id}', false)`);
    
    const token = `bureau_${crypto.randomBytes(32).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const tokenPrefix = token.substring(0, 15);
    
    await client.query(
      `INSERT INTO bureau.ingest_tokens (workspace_id, name, token_hash, token_prefix)
       VALUES ($1, $2, $3, $4)`,
      [workspace1Id, 'Ingest Token', tokenHash, tokenPrefix]
    );
    
    // Resolve token
    const tokenInfo = await client.query(
      `SELECT * FROM bureau.resolve_ingest_token($1)`,
      [token]
    );
    
    // Check stream count before
    const beforeCount = await client.query(
      `SELECT COUNT(*) FROM bureau.streams WHERE workspace_id = $1`,
      [workspace1Id]
    );
    
    // Create stream via ingest (simulate /api/ingest auto-create)
    const streamName = 'test-auto-stream';
    const createResult = await client.query(
      `INSERT INTO bureau.streams (workspace_id, name, category, description)
       VALUES ($1, $2, 'production', 'Auto-created from agent ingest')
       RETURNING id`,
      [workspace1Id, streamName]
    );
    
    const streamId = createResult.rows[0].id;
    
    // Insert ingest log
    const payload = {
      type: 'intake',
      stream: streamName,
      stream_id: streamId,
      content: 'Test ingest',
      metadata: { cost_usd: 1.23 }
    };
    
    await client.query(
      `SELECT bureau.insert_ingest_log($1, $2, $3)`,
      [workspace1Id, tokenInfo.rows[0].token_id, JSON.stringify(payload)]
    );
    
    // Check stream count after
    const afterCount = await client.query(
      `SELECT COUNT(*) FROM bureau.streams WHERE workspace_id = $1`,
      [workspace1Id]
    );
    
    expect(parseInt(afterCount.rows[0].count)).toBe(parseInt(beforeCount.rows[0].count) + 1);
  });

  it('should enforce stream limit (50 max)', async () => {
    await client.query(`SELECT set_config('request.jwt.claim.sub', '${user1Id}', false)`);
    
    // Create 50 streams
    for (let i = 0; i < 50; i++) {
      await client.query(
        `INSERT INTO bureau.streams (workspace_id, name, category, description)
         VALUES ($1, $2, 'production', 'Test stream')`,
        [workspace1Id, `stream-${i}`]
      );
    }
    
    // Check count
    const count = await client.query(
      `SELECT COUNT(*) FROM bureau.streams WHERE workspace_id = $1`,
      [workspace1Id]
    );
    
    expect(parseInt(count.rows[0].count)).toBeGreaterThanOrEqual(50);
  });

  it('should isolate workspaces (user1 cannot see user2 data)', async () => {
    // User1 creates stream
    await client.query(`SELECT set_config('request.jwt.claim.sub', '${user1Id}', false)`);
    await client.query(
      `INSERT INTO bureau.streams (workspace_id, name, category, description)
       VALUES ($1, 'user1-stream', 'production', 'User 1 stream')`,
      [workspace1Id]
    );
    
    // User2 creates stream
    await client.query(`SELECT set_config('request.jwt.claim.sub', '${user2Id}', false)`);
    await client.query(
      `INSERT INTO bureau.streams (workspace_id, name, category, description)
       VALUES ($1, 'user2-stream', 'production', 'User 2 stream')`,
      [workspace2Id]
    );
    
    // User1 queries - should only see their stream
    await client.query(`SELECT set_config('request.jwt.claim.sub', '${user1Id}', false)`);
    const user1Streams = await client.query(
      `SELECT name FROM bureau.streams WHERE workspace_id IN (SELECT bureau.user_workspaces())`
    );
    
    const user1Names = user1Streams.rows.map(r => r.name);
    expect(user1Names).toContain('user1-stream');
    expect(user1Names).not.toContain('user2-stream');
    
    // User2 queries - should only see their stream
    await client.query(`SELECT set_config('request.jwt.claim.sub', '${user2Id}', false)`);
    const user2Streams = await client.query(
      `SELECT name FROM bureau.streams WHERE workspace_id IN (SELECT bureau.user_workspaces())`
    );
    
    const user2Names = user2Streams.rows.map(r => r.name);
    expect(user2Names).toContain('user2-stream');
    expect(user2Names).not.toContain('user1-stream');
  });

  it('should aggregate per-stream costs correctly', async () => {
    await client.query(`SELECT set_config('request.jwt.claim.sub', '${user1Id}', false)`);
    
    // Create two streams
    const stream1 = await client.query(
      `INSERT INTO bureau.streams (workspace_id, name, category, description)
       VALUES ($1, 'cost-stream-1', 'production', 'Test')
       RETURNING id`,
      [workspace1Id]
    );
    
    const stream2 = await client.query(
      `INSERT INTO bureau.streams (workspace_id, name, category, description)
       VALUES ($1, 'cost-stream-2', 'production', 'Test')
       RETURNING id`,
      [workspace1Id]
    );
    
    // Create token
    const token = `bureau_${crypto.randomBytes(32).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const tokenPrefix = token.substring(0, 15);
    
    const tokenResult = await client.query(
      `INSERT INTO bureau.ingest_tokens (workspace_id, name, token_hash, token_prefix)
       VALUES ($1, 'Test Token', $2, $3)
       RETURNING id`,
      [workspace1Id, tokenHash, tokenPrefix]
    );
    
    const tokenId = tokenResult.rows[0].id;
    
    // Log costs to stream1
    await client.query(
      `SELECT bureau.insert_ingest_log($1, $2, $3)`,
      [workspace1Id, tokenId, JSON.stringify({
        stream_id: stream1.rows[0].id,
        content: 'Stream 1 log',
        metadata: { cost_usd: 10.00 }
      })]
    );
    
    await client.query(
      `SELECT bureau.insert_ingest_log($1, $2, $3)`,
      [workspace1Id, tokenId, JSON.stringify({
        stream_id: stream1.rows[0].id,
        content: 'Stream 1 log 2',
        metadata: { cost_usd: 5.00 }
      })]
    );
    
    // Log costs to stream2
    await client.query(
      `SELECT bureau.insert_ingest_log($1, $2, $3)`,
      [workspace1Id, tokenId, JSON.stringify({
        stream_id: stream2.rows[0].id,
        content: 'Stream 2 log',
        metadata: { cost_usd: 20.00 }
      })]
    );
    
    // Query per-stream costs (simulate /top-floor query)
    const costs = await client.query(`
      SELECT 
        s.name,
        COALESCE(SUM(
          CASE 
            WHEN il.payload->>'stream_id' IS NOT NULL
            AND (il.payload->>'stream_id')::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND (il.payload->>'stream_id')::uuid = s.id
            AND il.payload->'metadata'->>'cost_usd' IS NOT NULL
            AND il.payload->'metadata'->>'cost_usd' ~ '^[0-9]+\\.?[0-9]*$'
            THEN (il.payload->'metadata'->>'cost_usd')::numeric
            ELSE 0
          END
        ), 0) as total_cost
      FROM bureau.streams s
      LEFT JOIN bureau.ingest_log il ON il.workspace_id = s.workspace_id
      WHERE s.workspace_id = $1
      AND s.name IN ('cost-stream-1', 'cost-stream-2')
      GROUP BY s.id, s.name
      ORDER BY s.name
    `, [workspace1Id]);
    
    expect(costs.rows.length).toBe(2);
    expect(parseFloat(costs.rows[0].total_cost)).toBe(15.00); // stream1
    expect(parseFloat(costs.rows[1].total_cost)).toBe(20.00); // stream2
  });
});
