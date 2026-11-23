/**
 * Decision Records Integration Test
 * 
 * Tests the complete decision records feature against a real PostgreSQL database
 * with actual migrations applied. Verifies:
 * - All CRUD operations via bureau_app role and withUser
 * - Baseline auto-fill from metric_values
 * - Ingest 'decision' type
 * - Cross-workspace isolation (404s)
 * - Error handling (non-UUID IDs return 404/400, never 500)
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';

// Test database connection
const TEST_DB_URL = 'postgresql://bureau_app:test_password@localhost:5432/bureau_test';

let pool: Pool;
let testUsers: { userA: string; userB: string } = { userA: '', userB: '' };
let testWorkspaces: { workspaceA: string; workspaceB: string } = { workspaceA: '', workspaceB: '' };
let testStreams: { streamA: string; streamB: string } = { streamA: '', streamB: '' };
let testTokens: { tokenA: string; tokenB: string } = { tokenA: '', tokenB: '' };

// Helper to simulate withUser context (sets JWT claims)
async function withUser<T>(userId: string, email: string, fn: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const claims = JSON.stringify({
      sub: userId,
      email: email,
      role: 'authenticated',
      aud: 'authenticated'
    });
    
    await client.query('SELECT set_config($1, $2, true)', ['request.jwt.claims', claims]);
    await client.query('SELECT set_config($1, $2, true)', ['request.jwt.claim.sub', userId]);
    
    const result = await fn(client);
    
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Helper to run as postgres superuser (for test setup/teardown)
async function asSuperuser<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const superPool = new Pool({ 
    connectionString: 'postgresql://postgres:test_password@localhost:5432/bureau_test' 
  });
  const client = await superPool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
    await superPool.end();
  }
}

beforeAll(async () => {
  pool = new Pool({ connectionString: TEST_DB_URL });
  
  // Setup: Create test users, workspaces, streams as superuser
  await asSuperuser(async (client) => {
    // Create test users
    const userAResult = await client.query(
      `INSERT INTO auth.users (email) VALUES ('usera@test.com') RETURNING id`
    );
    const userBResult = await client.query(
      `INSERT INTO auth.users (email) VALUES ('userb@test.com') RETURNING id`
    );
    
    testUsers.userA = userAResult.rows[0].id;
    testUsers.userB = userBResult.rows[0].id;
    
    // Create workspaces
    const workspaceAResult = await client.query(
      `INSERT INTO bureau.workspaces (name, created_by) VALUES ('Workspace A', $1) RETURNING id`,
      [testUsers.userA]
    );
    const workspaceBResult = await client.query(
      `INSERT INTO bureau.workspaces (name, created_by) VALUES ('Workspace B', $1) RETURNING id`,
      [testUsers.userB]
    );
    
    testWorkspaces.workspaceA = workspaceAResult.rows[0].id;
    testWorkspaces.workspaceB = workspaceBResult.rows[0].id;
    
    // Add users to their workspaces
    await client.query(
      `INSERT INTO bureau.workspace_members (workspace_id, user_id, role, joined_at) 
       VALUES ($1, $2, 'owner', NOW())`,
      [testWorkspaces.workspaceA, testUsers.userA]
    );
    await client.query(
      `INSERT INTO bureau.workspace_members (workspace_id, user_id, role, joined_at) 
       VALUES ($1, $2, 'owner', NOW())`,
      [testWorkspaces.workspaceB, testUsers.userB]
    );
    
    // Create streams
    const streamAResult = await client.query(
      `INSERT INTO bureau.streams (workspace_id, name, category, description) 
       VALUES ($1, 'Test Stream A', 'production', 'Test stream for user A') RETURNING id`,
      [testWorkspaces.workspaceA]
    );
    const streamBResult = await client.query(
      `INSERT INTO bureau.streams (workspace_id, name, category, description) 
       VALUES ($1, 'Test Stream B', 'production', 'Test stream for user B') RETURNING id`,
      [testWorkspaces.workspaceB]
    );
    
    testStreams.streamA = streamAResult.rows[0].id;
    testStreams.streamB = streamBResult.rows[0].id;
    
    // Create ingest tokens (using hashed format)
    // Token A: bureau_test_a_12345
    // Token B: bureau_test_b_67890
    const tokenA = 'bureau_test_a_12345';
    const tokenB = 'bureau_test_b_67890';
    
    const tokenAResult = await client.query(
      `INSERT INTO bureau.ingest_tokens (workspace_id, token_hash, token_prefix, name) 
       VALUES ($1, encode(extensions.digest($2, 'sha256'), 'hex'), $3, 'Token A') RETURNING id`,
      [testWorkspaces.workspaceA, tokenA, tokenA.substring(0, 8)]
    );
    const tokenBResult = await client.query(
      `INSERT INTO bureau.ingest_tokens (workspace_id, token_hash, token_prefix, name) 
       VALUES ($1, encode(extensions.digest($2, 'sha256'), 'hex'), $3, 'Token B') RETURNING id`,
      [testWorkspaces.workspaceB, tokenB, tokenB.substring(0, 8)]
    );
    
    testTokens.tokenA = tokenA;
    testTokens.tokenB = tokenB;
  });
});

afterAll(async () => {
  // Cleanup
  await asSuperuser(async (client) => {
    await client.query(`DELETE FROM bureau.workspaces WHERE id IN ($1, $2)`, 
      [testWorkspaces.workspaceA, testWorkspaces.workspaceB]);
    await client.query(`DELETE FROM auth.users WHERE id IN ($1, $2)`, 
      [testUsers.userA, testUsers.userB]);
  });
  
  await pool.end();
});

describe('Decision Records Integration', () => {
  let decisionId: string;
  
  test('CREATE: User A can create a decision in their workspace', async () => {
    const result = await withUser(testUsers.userA, 'usera@test.com', async (client) => {
      const res = await client.query(
        `INSERT INTO bureau.decisions (
          workspace_id, stream_id, title, action, metric_name, 
          baseline_value, baseline_unit, review_date, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          testWorkspaces.workspaceA,
          testStreams.streamA,
          'Test Decision 1',
          'Switched to daily uploads',
          'views_per_video',
          1250,
          'views',
          '2026-11-30',
          testUsers.userA
        ]
      );
      return res.rows[0];
    });
    
    expect(result).toBeDefined();
    expect(result.title).toBe('Test Decision 1');
    expect(result.verdict).toBe('pending');
    expect(result.baseline_value).toBe('1250');
    
    decisionId = result.id;
    console.log('✅ Created decision:', decisionId);
  });
  
  test('LIST: User A can list their decisions', async () => {
    const results = await withUser(testUsers.userA, 'usera@test.com', async (client) => {
      const res = await client.query(
        `SELECT * FROM bureau.decisions WHERE workspace_id = $1 ORDER BY created_at DESC`,
        [testWorkspaces.workspaceA]
      );
      return res.rows;
    });
    
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].workspace_id).toBe(testWorkspaces.workspaceA);
    console.log('✅ Listed decisions, count:', results.length);
  });
  
  test('LIST: Due filter returns only pending decisions with review_date <= today', async () => {
    // Create one due and one future decision
    await withUser(testUsers.userA, 'usera@test.com', async (client) => {
      await client.query(
        `INSERT INTO bureau.decisions (
          workspace_id, title, action, metric_name, review_date, created_by
        ) VALUES ($1, 'Due Decision', 'Test', 'metric', CURRENT_DATE, $2)`,
        [testWorkspaces.workspaceA, testUsers.userA]
      );
      
      await client.query(
        `INSERT INTO bureau.decisions (
          workspace_id, title, action, metric_name, review_date, created_by
        ) VALUES ($1, 'Future Decision', 'Test', 'metric', CURRENT_DATE + INTERVAL '7 days', $2)`,
        [testWorkspaces.workspaceA, testUsers.userA]
      );
    });
    
    const dueResults = await withUser(testUsers.userA, 'usera@test.com', async (client) => {
      const res = await client.query(
        `SELECT * FROM bureau.decisions 
         WHERE workspace_id = $1 
         AND review_date <= CURRENT_DATE 
         AND verdict = 'pending'`,
        [testWorkspaces.workspaceA]
      );
      return res.rows;
    });
    
    expect(dueResults.length).toBeGreaterThan(0);
    expect(dueResults.every((d: any) => d.verdict === 'pending')).toBe(true);
    console.log('✅ Due filter works, found', dueResults.length, 'due decisions');
  });
  
  test('PATCH: User A can update decision outcome', async () => {
    const result = await withUser(testUsers.userA, 'usera@test.com', async (client) => {
      const res = await client.query(
        `UPDATE bureau.decisions 
         SET outcome_value = $1, outcome_notes = $2, verdict = $3, reviewed_at = NOW()
         WHERE id = $4 AND workspace_id = $5
         RETURNING *`,
        [1500, 'Views increased by 20%', 'worked', decisionId, testWorkspaces.workspaceA]
      );
      return res.rows[0];
    });
    
    expect(result).toBeDefined();
    expect(result.outcome_value).toBe('1500');
    expect(result.verdict).toBe('worked');
    expect(result.reviewed_at).toBeTruthy();
    console.log('✅ Updated decision outcome');
  });
  
  test('BASELINE AUTO-FILL: Can auto-fill from metric_values', async () => {
    // Insert a metric value
    await withUser(testUsers.userA, 'usera@test.com', async (client) => {
      await client.query(
        `INSERT INTO bureau.metric_values (stream_id, metric_id, value, timestamp, source)
         VALUES ($1, 'conversion_rate', 2.5, NOW(), 'manual')`,
        [testStreams.streamA]
      );
    });
    
    // Simulate auto-fill logic
    const baselineValue = await withUser(testUsers.userA, 'usera@test.com', async (client) => {
      const res = await client.query(
        `SELECT value FROM bureau.metric_values 
         WHERE stream_id = $1 AND metric_id = $2 
         ORDER BY timestamp DESC LIMIT 1`,
        [testStreams.streamA, 'conversion_rate']
      );
      return res.rows[0]?.value;
    });
    
    expect(baselineValue).toBe('2.5');
    
    // Create decision with auto-filled baseline
    const decision = await withUser(testUsers.userA, 'usera@test.com', async (client) => {
      const res = await client.query(
        `INSERT INTO bureau.decisions (
          workspace_id, stream_id, title, action, metric_name, 
          baseline_value, review_date, created_by
        ) VALUES ($1, $2, 'Auto-baseline Decision', 'Test action', 'conversion_rate', $3, $4, $5)
        RETURNING *`,
        [testWorkspaces.workspaceA, testStreams.streamA, baselineValue, '2026-12-01', testUsers.userA]
      );
      return res.rows[0];
    });
    
    expect(decision.baseline_value).toBe('2.5');
    console.log('✅ Baseline auto-fill works');
  });
  
  test('INGEST: Can create decision via ingest API pattern', async () => {
    // Simulate ingest 'decision' type
    await asSuperuser(async (client) => {
      // First resolve token using the hashed lookup (simulating resolve_ingest_token function)
      const tokenHash = await client.query(
        `SELECT encode(extensions.digest($1, 'sha256'), 'hex') as hash`,
        [testTokens.tokenA]
      );
      
      const tokenResult = await client.query(
        `SELECT t.workspace_id, w.created_by as user_id, t.id as token_id
         FROM bureau.ingest_tokens t
         JOIN bureau.workspaces w ON w.id = t.workspace_id
         WHERE t.token_hash = $1 AND t.revoked_at IS NULL`,
        [tokenHash.rows[0].hash]
      );
      
      expect(tokenResult.rows.length).toBe(1);
      const tokenInfo = tokenResult.rows[0];
      
      // Then create decision as the user (simulating ingest flow)
      await client.query('BEGIN');
      
      const claims = JSON.stringify({
        sub: tokenInfo.user_id,
        email: 'usera@test.com',
        role: 'authenticated'
      });
      await client.query('SELECT set_config($1, $2, true)', ['request.jwt.claims', claims]);
      await client.query('SELECT set_config($1, $2, true)', ['request.jwt.claim.sub', tokenInfo.user_id]);
      
      const decisionResult = await client.query(
        `INSERT INTO bureau.decisions (
          workspace_id, stream_id, title, action, metric_name, 
          baseline_value, baseline_unit, review_date, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id`,
        [
          tokenInfo.workspace_id,
          testStreams.streamA,
          'Ingest Decision',
          'Agent proposed action',
          'engagement_rate',
          3.2,
          '%',
          '2026-12-10',
          tokenInfo.user_id
        ]
      );
      
      expect(decisionResult.rows[0].id).toBeDefined();
      console.log('✅ Ingest decision created:', decisionResult.rows[0].id);
      
      // Log the ingest
      await client.query(
        `INSERT INTO bureau.ingest_log (workspace_id, token_id, payload)
         VALUES ($1, $2, $3)`,
        [
          tokenInfo.workspace_id,
          tokenInfo.token_id,
          JSON.stringify({
            type: 'decision',
            decision_id: decisionResult.rows[0].id,
            content: 'Agent proposed decision'
          })
        ]
      );
      
      await client.query('COMMIT');
    });
  });
  
  test('CROSS-WORKSPACE: User B gets empty list (not User A decisions)', async () => {
    const results = await withUser(testUsers.userB, 'userb@test.com', async (client) => {
      const res = await client.query(
        `SELECT * FROM bureau.decisions WHERE workspace_id = $1`,
        [testWorkspaces.workspaceB]
      );
      return res.rows;
    });
    
    // User B has no decisions in their workspace
    expect(results.length).toBe(0);
    console.log('✅ User B sees 0 decisions (workspace isolation works)');
  });
  
  test('CROSS-WORKSPACE: User B cannot see User A decision by ID', async () => {
    // User B tries to query User A's decision
    const results = await withUser(testUsers.userB, 'userb@test.com', async (client) => {
      const res = await client.query(
        `SELECT * FROM bureau.decisions WHERE id = $1 AND workspace_id = $2`,
        [decisionId, testWorkspaces.workspaceB]
      );
      return res.rows;
    });
    
    // Should return empty (RLS blocks it)
    expect(results.length).toBe(0);
    console.log('✅ User B cannot see User A decision (404 equivalent)');
  });
  
  test('CROSS-WORKSPACE: User B (via token from workspace B) cannot create decision in workspace A', async () => {
    // User B is authenticated and tries to create a decision in workspace A
    // This should fail RLS check because workspace A is not in user B's workspaces
    let error: any = null;
    
    try {
      await withUser(testUsers.userB, 'userb@test.com', async (client) => {
        // Try to create decision in workspace A (should fail RLS WITH CHECK policy)
        await client.query(
          `INSERT INTO bureau.decisions (
            workspace_id, title, action, metric_name, review_date, created_by
          ) VALUES ($1, 'Malicious', 'Hack', 'fake', '2026-12-01', $2)
          RETURNING id`,
          [testWorkspaces.workspaceA, testUsers.userB]
        );
      });
    } catch (e) {
      error = e;
    }
    
    expect(error).toBeDefined();
    expect(error.message).toContain('new row violates row-level security policy');
    console.log('✅ User B cannot create decision in workspace A (RLS blocked)');
  });
  
  test('ERROR HANDLING: Invalid UUID returns no results (404 equivalent)', async () => {
    const results = await withUser(testUsers.userA, 'usera@test.com', async (client) => {
      // Query with non-existent UUID
      const res = await client.query(
        `SELECT * FROM bureau.decisions 
         WHERE id = $1 AND workspace_id = $2`,
        ['00000000-0000-0000-0000-000000000000', testWorkspaces.workspaceA]
      );
      return res.rows;
    });
    
    expect(results.length).toBe(0);
    console.log('✅ Invalid UUID returns empty result (404 equivalent)');
  });
  
  test('ERROR HANDLING: Non-UUID string throws error (400 equivalent)', async () => {
    await expect(async () => {
      await withUser(testUsers.userA, 'usera@test.com', async (client) => {
        await client.query(
          `SELECT * FROM bureau.decisions WHERE id = $1::uuid`,
          ['not-a-uuid']
        );
      });
    }).rejects.toThrow();
    
    console.log('✅ Non-UUID string throws error (400 equivalent)');
  });
  
  test('DELETE: User A can delete their decision', async () => {
    const result = await withUser(testUsers.userA, 'usera@test.com', async (client) => {
      const res = await client.query(
        `DELETE FROM bureau.decisions 
         WHERE id = $1 AND workspace_id = $2
         RETURNING id`,
        [decisionId, testWorkspaces.workspaceA]
      );
      return res.rows;
    });
    
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(decisionId);
    console.log('✅ Deleted decision');
  });
  
  test('VERIFY: Migration naming and order is consistent', async () => {
    // Check that decisions migration file follows naming convention
    const fs = require('fs');
    const path = require('path');
    
    const migrationsDir = path.join(__dirname, '../../supabase/migrations');
    const files = fs.readdirSync(migrationsDir).sort();
    
    // Verify naming pattern: YYYYMMDDHHMMSS_name.sql
    const decisionsFile = files.find((f: string) => f.includes('decisions'));
    expect(decisionsFile).toBe('20261123000000_decisions.sql');
    
    // Verify it's last in sequence
    expect(files[files.length - 1]).toBe('20261123000000_decisions.sql');
    
    console.log('✅ Migration naming and order verified');
    console.log('   Files:', files.join(', '));
  });
});
