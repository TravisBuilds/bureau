/**
 * OAuth Hardening Full Tests
 * Tests with admin (postgres) setup + app (bureau_app) execution
 * 
 * Run: DATABASE_URL=postgresql://bureau_app:test@localhost/bureau_test npx tsx tests/oauth-hardening-full.test.ts
 */

import crypto from 'crypto';
import { adminQuery, appPool, cleanupTests, closeAll } from './test-db';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function runTests() {
  console.log('🔒 OAuth Hardening Full Tests\n');
  
  try {
    await cleanupTests();
    
    // Setup test data as admin (postgres)
    const userId1 = crypto.randomUUID();
    const userId2 = crypto.randomUUID();
    const workspaceId1 = crypto.randomUUID();
    const workspaceId2 = crypto.randomUUID();
    
    await adminQuery(`INSERT INTO auth.users (id, email) VALUES ($1, 'test1@example.com'), ($2, 'test2@example.com')`, [userId1, userId2]);
    await adminQuery(`INSERT INTO bureau.workspaces (id, name, created_by) VALUES ($1, 'Workspace 1', $2), ($3, 'Workspace 2', $4)`, [workspaceId1, userId1, workspaceId2, userId2]);
    await adminQuery(`INSERT INTO bureau.workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner'), ($3, $4, 'owner')`,
      [workspaceId1, userId1, workspaceId2, userId2]);
    await adminQuery(`INSERT INTO bureau.oauth_clients (client_id, client_name, redirect_uris, registration, vendor, verified) 
                      VALUES ('test_client', 'Test Client', ARRAY['https://example.com/callback'], 'static', 'other', false)`);
    
    // Test 1: Connection revoke makes tokens stop working
    console.log('1️⃣  Connection revoke invalidates tokens immediately\n');
    
    // Create grant + agent_link + tokens as admin
    const grantId1 = crypto.randomUUID();
    const agentLinkId1 = crypto.randomUUID();
    await adminQuery(
      `INSERT INTO bureau.oauth_grants (id, workspace_id, user_id, client_id, vendor, scopes, status)
       VALUES ($1, $2, $3, 'test_client', 'other', ARRAY['ingest:write'], 'active')`,
      [grantId1, workspaceId1, userId1]
    );
    await adminQuery(
      `INSERT INTO bureau.agent_links (id, grant_id, agent_label, stream_ids, allow_create_streams, scopes)
       VALUES ($1, $2, 'Test Agent', ARRAY[]::uuid[], true, ARRAY['ingest:write'])`,
      [agentLinkId1, grantId1]
    );
    
    const accessToken1 = `bureau_at_${crypto.randomBytes(32).toString('hex')}`;
    const refreshToken1 = `bureau_rt_${crypto.randomBytes(32).toString('hex')}`;
    const at1Hash = hashToken(accessToken1);
    const rt1Hash = hashToken(refreshToken1);
    
    await adminQuery(
      `INSERT INTO bureau.oauth_tokens (token_hash, token_prefix, kind, grant_id, expires_at)
       VALUES ($1, $2, 'access', $3, NOW() + INTERVAL '1 hour'),
              ($4, $5, 'refresh', $3, NOW() + INTERVAL '30 days')`,
      [at1Hash, accessToken1.substring(0, 15), grantId1, rt1Hash, refreshToken1.substring(0, 15)]
    );
    
    // Verify token works (via resolve_credential as app)
    const beforeRevoke = await appPool.query(
      `SELECT workspace_id FROM bureau.resolve_credential($1)`,
      [accessToken1]
    );
    console.log(`   ${beforeRevoke.rows.length > 0 ? '✅' : '❌'} Before revoke: token resolves to workspace ${beforeRevoke.rows.length > 0 ? '(valid)' : '(invalid)'}`);
    
    if (beforeRevoke.rows.length === 0) {
      console.log(`   Debug: grant_id=${grantId1}, token_hash=${at1Hash.substring(0, 16)}...`);
      console.log('   ❌ FAIL: Token should work before revoke\n');
      process.exit(1);
    }
    
    // Revoke grant (as app, simulating /api/connections/[id])
    await appPool.query(
      `UPDATE bureau.oauth_grants 
       SET status = 'revoked', revoked_at = NOW(), revoked_reason = 'User revoked'
       WHERE id = $1 AND workspace_id = $2 AND user_id = $3`,
      [grantId1, workspaceId1, userId1]
    );
    
    // Verify token no longer works (resolve_credential checks grant status)
    const afterRevoke = await appPool.query(
      `SELECT workspace_id FROM bureau.resolve_credential($1)`,
      [accessToken1]
    );
    console.log(`   ✅ After revoke: token resolves to workspace ${afterRevoke.rows.length > 0 ? '(still valid - FAIL)' : '(invalid - correct)'}`);
    
    if (afterRevoke.rows.length > 0) {
      console.log('   ❌ FAIL: Token should NOT work after grant revoked\n');
      process.exit(1);
    }
    
    // Verify refresh also fails (rotate_refresh_token checks grant status)
    try {
      await appPool.query(
        `SELECT * FROM bureau.rotate_refresh_token($1, $2, $3)`,
        [rt1Hash, hashToken('new_rt'), 'new_rt_prefix']
      );
      console.log('   ❌ FAIL: Refresh should fail after grant revoked\n');
      process.exit(1);
    } catch (err: any) {
      if (err.message && (err.message.includes('GRANT_REVOKED') || err.message.includes('INVALID_REFRESH_TOKEN'))) {
        console.log('   ✅ Refresh token rejected after grant revoked\n');
      } else {
        console.log('   ❌ Wrong error:', err.message, '\n');
        process.exit(1);
      }
    }
    
    // Test 2: Cross-workspace token revocation blocked
    console.log('2️⃣  Cross-workspace token revocation blocked\n');
    
    // Create grant + agent_link + token for workspace 1
    const grantId2 = crypto.randomUUID();
    const agentLinkId2 = crypto.randomUUID();
    await adminQuery(
      `INSERT INTO bureau.oauth_grants (id, workspace_id, user_id, client_id, vendor, scopes, status)
       VALUES ($1, $2, $3, 'test_client', 'other', ARRAY['ingest:write'], 'active')`,
      [grantId2, workspaceId1, userId1]
    );
    await adminQuery(
      `INSERT INTO bureau.agent_links (id, grant_id, agent_label, stream_ids, allow_create_streams, scopes)
       VALUES ($1, $2, 'Test Agent 2', ARRAY[]::uuid[], true, ARRAY['ingest:write'])`,
      [agentLinkId2, grantId2]
    );
    
    const accessToken2 = `bureau_at_${crypto.randomBytes(32).toString('hex')}`;
    const at2Hash = hashToken(accessToken2);
    
    await adminQuery(
      `INSERT INTO bureau.oauth_tokens (token_hash, token_prefix, kind, grant_id, expires_at)
       VALUES ($1, $2, 'access', $3, NOW() + INTERVAL '1 hour')`,
      [at2Hash, accessToken2.substring(0, 15), grantId2]
    );
    
    // Try to revoke workspace 1's token using workspace 2's credentials (should fail)
    const revokeResult = await appPool.query(
      `SELECT bureau.revoke_oauth_token($1, $2, $3)`,
      [accessToken2, userId2, workspaceId2] // Wrong user/workspace!
    );
    
    const revoked = revokeResult.rows[0]?.revoke_oauth_token;
    
    if (revoked) {
      console.log('   ❌ FAIL: Cross-workspace revocation succeeded (should be blocked)\n');
      process.exit(1);
    } else {
      console.log('   ✅ Cross-workspace revocation blocked (ownership check enforced)\n');
    }
    
    // Verify token still works (wasn't revoked)
    const stillWorks = await appPool.query(
      `SELECT workspace_id FROM bureau.resolve_credential($1)`,
      [accessToken2]
    );
    
    if (stillWorks.rows.length === 0) {
      console.log('   ❌ FAIL: Token was revoked despite ownership check\n');
      process.exit(1);
    } else {
      console.log('   ✅ Token still valid (not revoked by other workspace)\n');
    }
    
    // Test 3: Correct owner CAN revoke
    console.log('3️⃣  Correct owner can revoke their own token\n');
    
    const correctRevoke = await appPool.query(
      `SELECT bureau.revoke_oauth_token($1, $2, $3)`,
      [accessToken2, userId1, workspaceId1] // Correct owner!
    );
    
    const correctlyRevoked = correctRevoke.rows[0]?.revoke_oauth_token;
    
    if (!correctlyRevoked) {
      console.log('   ❌ FAIL: Owner revocation failed\n');
      process.exit(1);
    } else {
      console.log('   ✅ Owner successfully revoked their own token\n');
    }
    
    console.log('✅ All hardening tests passed!\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    await closeAll();
    process.exit(0);
  }
}

runTests();
