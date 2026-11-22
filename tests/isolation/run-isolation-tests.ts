/**
 * Run workspace isolation tests
 * 
 * Usage: npx tsx tests/isolation/run-isolation-tests.ts
 */

import { query, execute, queryWithUser } from '../../lib/db';

async function runTests() {
  console.log('🧪 Running Workspace Isolation Tests\n');
  
  let passed = 0;
  let failed = 0;
  
  // Setup: Create two users and workspaces
  console.log('📦 Setting up test data...');
  
  const userARows = await query<{ id: string }>(
    `INSERT INTO auth.users (email) VALUES ($1) RETURNING id`,
    ['isolation-test-a@test.com']
  );
  const userAId = userARows[0].id;
  
  const workspaceARows = await query<{ id: string }>(
    `INSERT INTO workspaces (name, created_by) VALUES ($1, $2) RETURNING id`,
    ['Test Workspace A', userAId]
  );
  const workspaceAId = workspaceARows[0].id;
  
  await execute(
    `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [workspaceAId, userAId]
  );
  
  await execute(
    `INSERT INTO streams (id, workspace_id, name, category, description) 
     VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', $1, 'Stream A', 'production', 'Test')`,
    [workspaceAId]
  );
  
  const userBRows = await query<{ id: string }>(
    `INSERT INTO auth.users (email) VALUES ($1) RETURNING id`,
    ['isolation-test-b@test.com']
  );
  const userBId = userBRows[0].id;
  
  const workspaceBRows = await query<{ id: string }>(
    `INSERT INTO workspaces (name, created_by) VALUES ($1, $2) RETURNING id`,
    ['Test Workspace B', userBId]
  );
  const workspaceBId = workspaceBRows[0].id;
  
  await execute(
    `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [workspaceBId, userBId]
  );
  
  await execute(
    `INSERT INTO streams (id, workspace_id, name, category, description) 
     VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', $1, 'Stream B', 'production', 'Test')`,
    [workspaceBId]
  );
  
  console.log(`✓ User A: ${userAId}`);
  console.log(`✓ Workspace A: ${workspaceAId}`);
  console.log(`✓ User B: ${userBId}`);
  console.log(`✓ Workspace B: ${workspaceBId}\n`);
  
  // Test 1: User A can read their own streams
  try {
    const streams = await queryWithUser<{ id: string }>(
      userAId,
      `SELECT id FROM streams WHERE workspace_id = $1`,
      [workspaceAId]
    );
    
    if (streams.length === 1 && streams[0].id === 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') {
      console.log('✅ Test 1: User A can read their own streams');
      passed++;
    } else {
      console.log('❌ Test 1: User A cannot read their own streams');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 1: Error -', error);
    failed++;
  }
  
  // Test 2: User A cannot read User B's streams
  try {
    const streams = await queryWithUser<{ id: string }>(
      userAId,
      `SELECT id FROM streams WHERE workspace_id = $1`,
      [workspaceBId]
    );
    
    if (streams.length === 0) {
      console.log('✅ Test 2: User A cannot read User B\'s streams (RLS working)');
      passed++;
    } else {
      console.log('❌ Test 2: User A CAN read User B\'s streams (RLS BROKEN)');
      console.log('   Found streams:', streams);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 2: Error -', error);
    failed++;
  }
  
  // Test 3: User B cannot read User A's streams
  try {
    const streams = await queryWithUser<{ id: string }>(
      userBId,
      `SELECT id FROM streams WHERE workspace_id = $1`,
      [workspaceAId]
    );
    
    if (streams.length === 0) {
      console.log('✅ Test 3: User B cannot read User A\'s streams (RLS working)');
      passed++;
    } else {
      console.log('❌ Test 3: User B CAN read User A\'s streams (RLS BROKEN)');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 3: Error -', error);
    failed++;
  }
  
  // Test 4: User A cannot update User B's stream
  try {
    const result = await queryWithUser<{ id: string }>(
      userAId,
      `UPDATE streams SET name = 'Hacked' WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' RETURNING id`
    );
    
    if (result.length === 0) {
      console.log('✅ Test 4: User A cannot update User B\'s stream (RLS working)');
      passed++;
    } else {
      console.log('❌ Test 4: User A CAN update User B\'s stream (RLS BROKEN)');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 4: Error -', error);
    failed++;
  }
  
  // Test 5: User A cannot delete User B's stream
  try {
    const result = await queryWithUser<{ id: string }>(
      userAId,
      `DELETE FROM streams WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' RETURNING id`
    );
    
    if (result.length === 0) {
      console.log('✅ Test 5: User A cannot delete User B\'s stream (RLS working)');
      passed++;
    } else {
      console.log('❌ Test 5: User A CAN delete User B\'s stream (RLS BROKEN)');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 5: Error -', error);
    failed++;
  }
  
  // Cleanup
  console.log('\n🧹 Cleaning up test data...');
  await execute(`DELETE FROM workspaces WHERE id IN ($1, $2)`, [workspaceAId, workspaceBId]);
  await execute(`DELETE FROM auth.users WHERE id IN ($1, $2)`, [userAId, userBId]);
  console.log('✓ Cleanup complete\n');
  
  // Summary
  console.log('═══════════════════════════════════════');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════');
  
  if (failed === 0) {
    console.log('✅ All isolation tests passed!');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed!');
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
