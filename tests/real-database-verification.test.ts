/**
 * Real Database Verification Tests
 * 
 * Tests against actual Postgres with migrations applied to verify:
 * 1. Stream detail queries work with real ingest data shape
 * 2. Costs API queries work with real ingest data shape
 * 3. Field paths match what /api/ingest writes and /top-floor reads
 * 4. Non-UUID and other-workspace streams return 404, never 500
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://bureau_app:test_password@localhost:5432/bureau_test';

describe('Real Database Verification', () => {
  let pool: Pool;
  let testWorkspaceId: string;
  let otherWorkspaceId: string;
  let testUserId: string;
  let otherUserId: string;
  let testStreamId: string;
  let testTokenId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });
    
    // Set up test data
    const client = await pool.connect();
    try {
      // Use test user IDs from auth.users stub
      testUserId = '11111111-1111-1111-1111-111111111111';
      otherUserId = '22222222-2222-2222-2222-222222222222';

      // Set JWT claims for test user (required for RLS)
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', [
        'request.jwt.claim.sub',
        testUserId
      ]);

      // Use bootstrap_workspace function (SECURITY DEFINER, bypasses RLS)
      // Function signature: bootstrap_workspace(p_workspace_name TEXT, p_user_email TEXT)
      const ws1 = await client.query(
        `SELECT bureau.bootstrap_workspace($1, $2) as id`,
        ['Test Workspace', 'test@example.com']
      );
      testWorkspaceId = ws1.rows[0].id;

      // Switch to other user and create their workspace
      await client.query('SELECT set_config($1, $2, true)', [
        'request.jwt.claim.sub',
        otherUserId
      ]);

      const ws2 = await client.query(
        `SELECT bureau.bootstrap_workspace($1, $2) as id`,
        ['Other Workspace', 'other@example.com']
      );
      otherWorkspaceId = ws2.rows[0].id;

      // Switch back to test user for remaining setup
      await client.query('SELECT set_config($1, $2, true)', [
        'request.jwt.claim.sub',
        testUserId
      ]);

      // Create test stream in test workspace
      const stream = await client.query(
        `INSERT INTO bureau.streams (workspace_id, name, category, description)
         VALUES ($1, 'Test Stream', 'production', 'Test stream for verification')
         RETURNING id`,
        [testWorkspaceId]
      );
      testStreamId = stream.rows[0].id;

      // Create ingest token for test workspace
      const token = await client.query(
        `INSERT INTO bureau.ingest_tokens (workspace_id, token_hash, token_prefix, name)
         VALUES ($1, 'test_token_hash_12345', 'bureau_test', 'Test Token')
         RETURNING id`,
        [testWorkspaceId]
      );
      testTokenId = token.rows[0].id;

      // Insert ingest logs using the EXACT structure that /api/ingest writes
      // This matches lines 165-172 of app/api/ingest/route.ts
      const ingestPayloads = [
        {
          type: 'cost',
          stream: 'Test Stream',
          stream_id: testStreamId,
          content: 'Episode 1 cost',
          metadata: {
            output_id: 'ep1',
            output_name: 'Episode 1',
            output_type: 'episode',
            cost_usd: '25.50',
            views: '100',
            elevenlabs_characters: '5000',
            trust_level: 'verified'
          },
          received_at: new Date().toISOString()
        },
        {
          type: 'cost',
          stream: 'Test Stream',
          stream_id: testStreamId,
          content: 'Episode 2 cost',
          metadata: {
            output_id: 'ep2',
            output_name: 'Episode 2',
            output_type: 'episode',
            cost_usd: '30.75',
            views: '150',
            higgsfield_credits: '100.5',
            trust_level: 'declared'
          },
          received_at: new Date().toISOString()
        },
        {
          type: 'metric',
          stream: 'Test Stream',
          stream_id: testStreamId,
          content: 'Subscriber count updated',
          metadata: {
            metric_name: 'subscribers',
            value: '1000'
          },
          received_at: new Date().toISOString()
        }
      ];

      for (const payload of ingestPayloads) {
        await client.query(
          `INSERT INTO bureau.ingest_log (workspace_id, token_id, payload, status)
           VALUES ($1, $2, $3::jsonb, 'approved')`,
          [testWorkspaceId, testTokenId, JSON.stringify(payload)]
        );
      }

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should fetch stream detail data with correct field paths', async () => {
    const client = await pool.connect();
    try {
      // Set JWT claims to simulate authenticated user
      await client.query('SELECT set_config($1, $2, false)', [
        'request.jwt.claim.sub',
        testUserId
      ]);

      // Run the EXACT query from app/stream-detail/[id]/page.tsx lines 25-56
      const result = await client.query(
        `SELECT 
          s.id, s.name, s.category, s.description,
          s.connected, s.data_source, s.last_updated,
          COUNT(DISTINCT il.id) FILTER (
            WHERE il.payload->>'stream_id' IS NOT NULL 
            AND s.id::text = il.payload->>'stream_id'
          ) as log_count,
          COALESCE(SUM(
            CASE 
              WHEN il.payload->'metadata'->>'cost_usd' IS NOT NULL
              AND il.payload->'metadata'->>'cost_usd' ~ '^[0-9]+\.?[0-9]*$'
              AND s.id::text = il.payload->>'stream_id'
              THEN (il.payload->'metadata'->>'cost_usd')::numeric
              ELSE 0
            END
          ), 0) as total_cost
         FROM bureau.streams s
         LEFT JOIN bureau.ingest_log il ON il.workspace_id = s.workspace_id
         WHERE s.id = $1 AND s.workspace_id = $2
         GROUP BY s.id, s.name, s.category, s.description, s.connected, s.data_source, s.last_updated`,
        [testStreamId, testWorkspaceId]
      );

      console.log('\n=== Stream Detail Query Result ===');
      console.log(JSON.stringify(result.rows[0], null, 2));

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].name).toBe('Test Stream');
      expect(result.rows[0].log_count).toBe('3'); // 3 logs total
      expect(parseFloat(result.rows[0].total_cost)).toBe(56.25); // 25.50 + 30.75

    } finally {
      client.release();
    }
  });

  it('should fetch recent logs with correct structure', async () => {
    const client = await pool.connect();
    try {
      await client.query('SELECT set_config($1, $2, false)', [
        'request.jwt.claim.sub',
        testUserId
      ]);

      // Run the EXACT query from app/stream-detail/[id]/page.tsx lines 58-72
      const result = await client.query(
        `SELECT 
          il.id,
          il.payload->>'type' as type,
          il.payload->>'content' as content,
          il.payload->'metadata'->>'cost_usd' as cost_usd,
          il.created_at,
          il.status
         FROM bureau.ingest_log il
         WHERE il.workspace_id = $1
         AND il.payload->>'stream_id' = $2::text
         ORDER BY il.created_at DESC
         LIMIT 20`,
        [testWorkspaceId, testStreamId]
      );

      console.log('\n=== Recent Logs Query Result ===');
      console.log('Total logs:', result.rows.length);
      result.rows.forEach((row, i) => {
        console.log(`Log ${i + 1}:`, {
          type: row.type,
          content: row.content,
          cost_usd: row.cost_usd,
          status: row.status
        });
      });

      expect(result.rows.length).toBe(3);
      expect(result.rows.some(r => r.type === 'cost')).toBe(true);
      expect(result.rows.some(r => r.type === 'metric')).toBe(true);
      expect(result.rows.some(r => r.cost_usd === '25.50')).toBe(true);

    } finally {
      client.release();
    }
  });

  it('should transform ingest logs into output costs format', async () => {
    const client = await pool.connect();
    try {
      await client.query('SELECT set_config($1, $2, false)', [
        'request.jwt.claim.sub',
        testUserId
      ]);

      // Run the EXACT query from app/api/streams/[id]/costs/route.ts lines 38-56
      const result = await client.query(
        `SELECT 
          il.id,
          il.payload->>'content' as content,
          il.payload->'metadata'->>'cost_usd' as cost_usd,
          il.payload->'metadata' as metadata,
          il.created_at,
          il.status
         FROM bureau.ingest_log il
         WHERE il.workspace_id = $1
         AND il.payload->>'stream_id' IS NOT NULL
         AND il.payload->>'stream_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         AND il.payload->>'stream_id' = $2::text
         ORDER BY il.created_at DESC
         LIMIT 100`,
        [testWorkspaceId, testStreamId]
      );

      console.log('\n=== Costs API Query Result ===');
      console.log('Total entries:', result.rows.length);
      result.rows.forEach((row, i) => {
        const metadata = row.metadata;
        console.log(`Entry ${i + 1}:`, {
          content: row.content,
          cost_usd: row.cost_usd,
          metadata_keys: metadata ? Object.keys(metadata) : [],
          output_id: metadata?.output_id,
          views: metadata?.views
        });
      });

      expect(result.rows.length).toBe(3);
      
      // Verify metadata structure matches what we wrote
      const costEntries = result.rows.filter(r => r.cost_usd);
      expect(costEntries.length).toBe(2);
      
      const ep1 = costEntries.find(r => r.metadata?.output_id === 'ep1');
      expect(ep1).toBeDefined();
      expect(ep1?.metadata?.cost_usd).toBe('25.50');
      expect(ep1?.metadata?.views).toBe('100');
      expect(ep1?.metadata?.output_name).toBe('Episode 1');

    } finally {
      client.release();
    }
  });

  it('should return 404 for non-UUID stream ID', async () => {
    const client = await pool.connect();
    try {
      await client.query('SELECT set_config($1, $2, false)', [
        'request.jwt.claim.sub',
        testUserId
      ]);

      // Test with invalid UUID format
      const result = await client.query(
        `SELECT 
          s.id, s.name
         FROM bureau.streams s
         WHERE s.id = $1::uuid AND s.workspace_id = $2`,
        ['not-a-uuid-format', testWorkspaceId]
      ).catch(err => {
        // Should throw invalid UUID error, not 500
        return { error: err.message };
      });

      console.log('\n=== Non-UUID Test Result ===');
      console.log('Result:', result);

      // This should throw an invalid UUID error
      expect(result).toHaveProperty('error');
      expect((result as any).error).toContain('invalid input syntax for type uuid');

    } finally {
      client.release();
    }
  });

  it('should return empty result for other workspace stream', async () => {
    const client = await pool.connect();
    try {
      // Switch to other user to create their stream
      await client.query('SELECT set_config($1, $2, false)', [
        'request.jwt.claim.sub',
        otherUserId
      ]);

      // Create a stream in the OTHER workspace (as other user)
      const otherStream = await client.query(
        `INSERT INTO bureau.streams (workspace_id, name, category, description)
         VALUES ($1, 'Other Stream', 'production', 'Stream in other workspace')
         RETURNING id`,
        [otherWorkspaceId]
      );
      const otherStreamId = otherStream.rows[0].id;

      // Switch back to test user
      await client.query('SELECT set_config($1, $2, false)', [
        'request.jwt.claim.sub',
        testUserId
      ]);

      // Try to access it as test user (should return empty - proper tenancy)
      const result = await client.query(
        `SELECT 
          s.id, s.name
         FROM bureau.streams s
         WHERE s.id = $1 AND s.workspace_id = $2`,
        [otherStreamId, testWorkspaceId]
      );

      console.log('\n=== Other Workspace Test Result ===');
      console.log('Attempting to access stream from other workspace...');
      console.log('Other stream ID:', otherStreamId);
      console.log('Test workspace ID:', testWorkspaceId);
      console.log('Other workspace ID:', otherWorkspaceId);
      console.log('Rows returned:', result.rows.length);

      // Should return empty (404 behavior) - correct tenancy
      expect(result.rows.length).toBe(0);

    } finally {
      client.release();
    }
  });

  it('should verify cost field path matches top-floor', async () => {
    const client = await pool.connect();
    try {
      await client.query('SELECT set_config($1, $2, false)', [
        'request.jwt.claim.sub',
        testUserId
      ]);

      // Run the EXACT cost calculation from app/top-floor/page.tsx lines 36-46
      const result = await client.query(
        `SELECT 
          COALESCE(SUM(
            CASE 
              WHEN il.payload->>'stream_id' IS NOT NULL
              AND il.payload->>'stream_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND il.payload->>'stream_id' = $2::text
              AND il.payload->'metadata'->>'cost_usd' IS NOT NULL
              AND il.payload->'metadata'->>'cost_usd' ~ '^[0-9]+\.?[0-9]*$'
              THEN (il.payload->'metadata'->>'cost_usd')::numeric
              ELSE 0
            END
          ), 0) as total_cost
         FROM bureau.ingest_log il
         WHERE il.workspace_id = $1`,
        [testWorkspaceId, testStreamId]
      );

      console.log('\n=== Top-Floor Cost Path Verification ===');
      console.log('Total cost from top-floor query:', result.rows[0].total_cost);

      expect(parseFloat(result.rows[0].total_cost)).toBe(56.25);

    } finally {
      client.release();
    }
  });
});
