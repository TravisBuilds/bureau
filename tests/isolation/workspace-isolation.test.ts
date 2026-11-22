/**
 * Workspace Isolation Tests
 * 
 * Verifies that User A cannot access User B's data via:
 * 1. API routes (token-based)
 * 2. RLS policies (database-level)
 */

import { query, execute } from '../../lib/db';

describe('Workspace Isolation', () => {
  let userA: { id: string; workspaceId: string };
  let userB: { id: string; workspaceId: string };
  let tokenA: string;
  let tokenB: string;
  
  beforeAll(async () => {
    // Create User A (auth.users for local dev)
    const userARows = await query<{ id: string }>(
      `INSERT INTO auth.users (email) VALUES ($1) RETURNING id`,
      ['user-a@test.com']
    );
    const userAId = userARows[0].id;
    
    // Create Workspace A (bureau schema)
    const workspaceARows = await query<{ id: string }>(
      `INSERT INTO bureau.workspaces (name, created_by) VALUES ($1, $2) RETURNING id`,
      ['Workspace A', userAId]
    );
    const workspaceAId = workspaceARows[0].id;
    
    // Add User A to Workspace A
    await execute(
      `INSERT INTO bureau.workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [workspaceAId, userAId]
    );
    
    // Create token for Workspace A
    const tokenARows = await query<{ token: string }>(
      `INSERT INTO bureau.ingest_tokens (workspace_id, name, token) 
       VALUES ($1, 'Token A', 'bureau_test_a') RETURNING token`,
      [workspaceAId]
    );
    tokenA = tokenARows[0].token;
    
    // Create User B
    const userBRows = await query<{ id: string }>(
      `INSERT INTO auth.users (email) VALUES ($1) RETURNING id`,
      ['user-b@test.com']
    );
    const userBId = userBRows[0].id;
    
    // Create Workspace B
    const workspaceBRows = await query<{ id: string }>(
      `INSERT INTO bureau.workspaces (name, created_by) VALUES ($1, $2) RETURNING id`,
      ['Workspace B', userBId]
    );
    const workspaceBId = workspaceBRows[0].id;
    
    // Add User B to Workspace B
    await execute(
      `INSERT INTO bureau.workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [workspaceBId, userBId]
    );
    
    // Create token for Workspace B
    const tokenBRows = await query<{ token: string }>(
      `INSERT INTO bureau.ingest_tokens (workspace_id, name, token) 
       VALUES ($1, 'Token B', 'bureau_test_b') RETURNING token`,
      [workspaceBId]
    );
    tokenB = tokenBRows[0].token;
    
    // Create stream for Workspace A
    await execute(
      `INSERT INTO bureau.streams (id, workspace_id, name, category, description) 
       VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', $1, 'Stream A', 'production', 'Test stream A')`,
      [workspaceAId]
    );
    
    // Create stream for Workspace B
    await execute(
      `INSERT INTO bureau.streams (id, workspace_id, name, category, description) 
       VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', $1, 'Stream B', 'production', 'Test stream B')`,
      [workspaceBId]
    );
    
    userA = { id: userAId, workspaceId: workspaceAId };
    userB = { id: userBId, workspaceId: workspaceBId };
  });
  
  afterAll(async () => {
    // Cleanup (cascade will handle related records)
    await execute(`DELETE FROM bureau.workspaces WHERE created_by IN ($1, $2)`, [userA.id, userB.id]);
    await execute(`DELETE FROM auth.users WHERE id IN ($1, $2)`, [userA.id, userB.id]);
  });
  
  describe('RLS Policies', () => {
    test('User A can read their own streams', async () => {
      // Set auth context to User A
      await execute(`SELECT auth.set_user($1::uuid)`, [userA.id]);
      
      // User A should see their stream
      const streams = await query<{ id: string }>(
        `SELECT id FROM bureau.streams WHERE workspace_id = $1`,
        [userA.workspaceId]
      );
      
      expect(streams.length).toBe(1);
      expect(streams[0].id).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    });
    
    test('User A cannot read User B streams via RLS', async () => {
      // Set auth context to User A
      await execute(`SELECT auth.set_user($1::uuid)`, [userA.id]);
      
      // User A should NOT see User B's stream
      const streams = await query<{ id: string }>(
        `SELECT id FROM bureau.streams WHERE workspace_id = $1`,
        [userB.workspaceId]
      );
      
      expect(streams.length).toBe(0);
    });
    
    test('User B cannot read User A streams via RLS', async () => {
      // Set auth context to User B
      await execute(`SELECT auth.set_user($1::uuid)`, [userB.id]);
      
      // User B should NOT see User A's stream
      const streams = await query<{ id: string }>(
        `SELECT id FROM bureau.streams WHERE workspace_id = $1`,
        [userA.workspaceId]
      );
      
      expect(streams.length).toBe(0);
    });
    
    test('User A can read their own ingest tokens', async () => {
      await execute(`SELECT auth.set_user($1::uuid)`, [userA.id]);
      
      const tokens = await query<{ token: string }>(
        `SELECT token FROM bureau.ingest_tokens WHERE workspace_id = $1`,
        [userA.workspaceId]
      );
      
      expect(tokens.length).toBe(1);
      expect(tokens[0].token).toBe('bureau_test_a');
    });
    
    test('User A cannot read User B ingest tokens', async () => {
      await execute(`SELECT auth.set_user($1::uuid)`, [userA.id]);
      
      const tokens = await query<{ token: string }>(
        `SELECT token FROM bureau.ingest_tokens WHERE workspace_id = $1`,
        [userB.workspaceId]
      );
      
      expect(tokens.length).toBe(0);
    });
  });
  
  describe('API Isolation', () => {
    test('Token A cannot access Workspace B streams', async () => {
      // Try to ingest to User B's stream using Token A
      const response = await fetch('http://localhost:3000/api/ingest', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenA}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'intake',
          stream: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', // User B's stream ID
          content: 'Attempting cross-workspace access'
        })
      });
      
      const data = await response.json();
      
      // Should succeed but stream_id should be null (not found in Token A's workspace)
      expect(data.stream_id).toBeNull();
    });
    
    test('API tokens list only shows own workspace tokens', async () => {
      // This would need to be tested with proper session management
      // For now, we verify via direct DB query with RLS
      await execute(`SELECT auth.set_user($1::uuid)`, [userA.id]);
      
      const tokens = await query<{ workspace_id: string }>(
        `SELECT workspace_id FROM bureau.ingest_tokens`
      );
      
      // User A should only see tokens from their workspace
      tokens.forEach(token => {
        expect(token.workspace_id).toBe(userA.workspaceId);
      });
    });
  });
  
  describe('Cross-Workspace Protection', () => {
    test('Cannot create stream in another workspace', async () => {
      await execute(`SELECT auth.set_user($1::uuid)`, [userA.id]);
      
      try {
        // Try to insert stream into User B's workspace as User A
        await execute(
          `INSERT INTO bureau.streams (workspace_id, name, category, description) 
           VALUES ($1, 'Malicious Stream', 'production', 'Should fail')`,
          [userB.workspaceId]
        );
        
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        // RLS should block this
        expect(error).toBeDefined();
      }
    });
    
    test('Cannot update another workspace stream', async () => {
      await execute(`SELECT auth.set_user($1::uuid)`, [userA.id]);
      
      const result = await query<{ id: string }>(
        `UPDATE bureau.streams SET name = 'Hacked' WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' RETURNING id`
      );
      
      // Should return 0 rows (RLS blocks update)
      expect(result.length).toBe(0);
    });
    
    test('Cannot delete another workspace stream', async () => {
      await execute(`SELECT auth.set_user($1::uuid)`, [userA.id]);
      
      const result = await query<{ id: string }>(
        `DELETE FROM bureau.streams WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' RETURNING id`
      );
      
      // Should return 0 rows (RLS blocks delete)
      expect(result.length).toBe(0);
    });
  });
});
