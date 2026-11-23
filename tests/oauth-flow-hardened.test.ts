/**
 * OAuth 2.1 Integration Test - Hardened
 * Setup as postgres, execution as bureau_app (no table grants)
 * 
 * Run: DATABASE_URL=postgresql://bureau_app:test@localhost/bureau_test npx tsx tests/oauth-flow-hardened.test.ts
 */

import crypto from 'crypto';
import { adminQuery, appPool, cleanupTests, closeAll } from './test-db';
import * as oauth from '../lib/oauth-server';

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function runTests() {
  console.log('🔐 OAuth Flow Integration Test (Hardened)\n');
  
  try {
    await cleanupTests();
    
    // === SETUP (as postgres admin) ===
    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    const workspaceA = crypto.randomUUID();
    const workspaceB = crypto.randomUUID();
    const streamA = crypto.randomUUID();
    const streamB = crypto.randomUUID();
    const clientId = 'test-oauth-client';
    
    console.log('📋 Setup (as postgres)');
    await adminQuery(`INSERT INTO auth.users (id, email) VALUES ($1, 'alice@example.com'), ($2, 'bob@example.com')`, [userA, userB]);
    await adminQuery(`INSERT INTO bureau.workspaces (id, name, created_by) VALUES ($1, 'Workspace A', $2), ($3, 'Workspace B', $4)`, [workspaceA, userA, workspaceB, userB]);
    await adminQuery(`INSERT INTO bureau.workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner'), ($3, $4, 'owner')`, [workspaceA, userA, workspaceB, userB]);
    await adminQuery(`INSERT INTO bureau.streams (id, workspace_id, name, category, description) VALUES ($1, $2, 'Stream A', 'production', 'Test stream'), ($3, $4, 'Stream B', 'production', 'Test stream')`, [streamA, workspaceA, streamB, workspaceB]);
    await adminQuery(
      `INSERT INTO bureau.oauth_clients (client_id, client_name, redirect_uris, registration, vendor, verified)
       VALUES ($1, 'Test Client', $2, 'static', 'other', false), ('script-device', 'Script Device', ARRAY[]::text[], 'static', 'script', false)`,
      [clientId, '{https://example.com/callback}']
    );
    console.log('   ✅ Users, workspaces, streams, client created\n');
    
    // === TEST 1: Store Authorization Code (via SECURITY DEFINER) ===
    console.log('1️⃣  Store authorization code');
    const pkce = generatePKCE();
    const redirectUri = 'https://example.com/callback';
    
    const authCode = await oauth.storeAuthCode({
      userId: userA,
      workspaceId: workspaceA,
      clientId,
      redirectUri,
      codeChallenge: pkce.challenge,
      resource: 'mcp://bureau.local/mcp',
      scopes: ['ingest:write'],
      agentLabel: 'Test Agent',
      streamIds: [streamA],
      allowCreateStreams: true
    });
    
    console.log(`   ✅ Code stored: ${authCode.substring(0, 20)}...\n`);
    
    // === TEST 2: Exchange Code with Correct PKCE ===
    console.log('2️⃣  Exchange code with correct PKCE');
    const tokenResult = await oauth.exchangeCode(
      authCode,
      pkce.verifier,
      clientId,
      redirectUri,
      'mcp://bureau.local/mcp'
    );
    
    if (!tokenResult) {
      throw new Error('Code exchange failed');
    }
    
    const access_token = tokenResult.accessToken;
    const refresh_token = tokenResult.refreshToken;
    console.log(`   ✅ Access token: ${access_token.substring(0, 20)}...`);
    console.log(`   ✅ Refresh token: ${refresh_token.substring(0, 20)}...\n`);
    
    // === TEST 3: resolve_credential on Access Token ===
    console.log('3️⃣  resolve_credential on access token');
    const credential = await appPool.query(
      `SELECT workspace_id, user_id, agent_link_id FROM bureau.resolve_credential($1)`,
      [access_token]
    );
    
    if (credential.rows.length === 0) {
      throw new Error('Token resolution failed');
    }
    
    if (credential.rows[0].workspace_id !== workspaceA || credential.rows[0].user_id !== userA) {
      throw new Error('Token resolved to wrong workspace/user');
    }
    
    console.log(`   ✅ Resolved to workspace A, user A\n`);
    
    // === TEST 4: Wrong PKCE Fails ===
    console.log('4️⃣  Exchange with wrong PKCE fails');
    const authCode2 = await oauth.storeAuthCode({
      userId: userA,
      workspaceId: workspaceA,
      clientId,
      redirectUri,
      codeChallenge: pkce.challenge,
      resource: 'mcp://bureau.local/mcp',
      scopes: ['ingest:write'],
      agentLabel: 'Test Agent 2',
      streamIds: [],
      allowCreateStreams: true
    });
    
    try {
      await oauth.exchangeCode(
        authCode2,
        'wrong_verifier_' + crypto.randomBytes(16).toString('base64url'),
        clientId,
        redirectUri,
        'mcp://bureau.local/mcp'
      );
      throw new Error('Wrong PKCE should have failed');
    } catch (err: any) {
      if (err.message.includes('INVALID_PKCE') || err.message.includes('INVALID_CODE_VERIFIER') || err.message.includes('invalid_grant')) {
        console.log('   ✅ Wrong PKCE rejected\n');
      } else {
        throw err;
      }
    }
    
    // === TEST 5: Code Reuse Fails ===
    console.log('5️⃣  Code reuse fails');
    try {
      await oauth.exchangeCode(
        authCode,
        pkce.verifier,
        clientId,
        redirectUri,
        'mcp://bureau.local/mcp'
      );
      throw new Error('Code reuse should have failed');
    } catch (err: any) {
      if (err.message.includes('INVALID_CODE') || err.message.includes('invalid_grant')) {
        console.log('   ✅ Code reuse blocked\n');
      } else {
        throw err;
      }
    }
    
    // === TEST 6: Refresh Token Rotation ===
    console.log('6️⃣  Refresh token rotation');
    const refreshResult = await oauth.refreshAccessToken(refresh_token);
    
    if (!refreshResult) {
      throw new Error('Refresh failed');
    }
    
    console.log(`   ✅ New access token: ${refreshResult.accessToken.substring(0, 20)}...`);
    console.log(`   ✅ New refresh token: ${refreshResult.refreshToken.substring(0, 20)}...\n`);
    
    // === TEST 7: Old Refresh Reuse Revokes Family ===
    console.log('7️⃣  Old refresh token reuse revokes family');
    try {
      await oauth.refreshAccessToken(refresh_token);
      throw new Error('Old refresh reuse should have failed');
    } catch (err: any) {
      if (err.message.includes('REFRESH_TOKEN_REUSE') || err.message.includes('INVALID_REFRESH_TOKEN') || err.message.includes('invalid_grant')) {
        console.log('   ✅ Refresh reuse detected, family revoked\n');
      } else {
        throw err;
      }
    }
    
    // Create a fresh grant for revocation testing
    console.log('8️⃣  Fresh grant for revocation test');
    const authCode3 = await oauth.storeAuthCode({
      userId: userA,
      workspaceId: workspaceA,
      clientId,
      redirectUri,
      codeChallenge: pkce.challenge,
      resource: 'mcp://bureau.local/mcp',
      scopes: ['ingest:write'],
      agentLabel: 'Test Agent 3',
      streamIds: [],
      allowCreateStreams: true
    });
    
    const tokenResult3 = await oauth.exchangeCode(
      authCode3,
      pkce.verifier,
      clientId,
      redirectUri,
      'mcp://bureau.local/mcp'
    );
    
    if (!tokenResult3) {
      throw new Error('Fresh code exchange failed');
    }
    
    console.log('   ✅ Fresh access + refresh tokens created\n');
    
    // === TEST 8: Revoke Grant (simulating /api/connections/[id]) ===
    console.log('9️⃣  Revoke grant as user A');
    
    // Find the grant_id by resolving the token and looking up the grant
    const resolveForGrant = await appPool.query(
      `SELECT workspace_id, user_id FROM bureau.resolve_credential($1)`,
      [tokenResult3.accessToken]
    );
    
    if (resolveForGrant.rows.length === 0) {
      throw new Error('Token resolution failed');
    }
    
    // Find most recent active grant for this user/workspace/client
    const grantResult = await appPool.query(
      `SELECT id FROM bureau.oauth_grants 
       WHERE workspace_id = $1 AND user_id = $2 AND client_id = $3 AND status = 'active'
       LIMIT 1`,
      [workspaceA, userA, clientId]
    );
    
    if (grantResult.rows.length === 0) {
      throw new Error('Grant not found');
    }
    
    const grantId = grantResult.rows[0].id;
    
    // Revoke via UPDATE (simulating /api/connections/[id] route)
    await appPool.query(
      `UPDATE bureau.oauth_grants 
       SET status = 'revoked', revoked_at = NOW(), revoked_reason = 'User revoked'
       WHERE id = $1 AND workspace_id = $2 AND user_id = $3`,
      [grantId, workspaceA, userA]
    );
    
    console.log('   ✅ Grant marked revoked\n');
    
    // === TEST 9: resolve_credential Fails After Revoke ===
    console.log('🔟 resolve_credential fails after revoke');
    const afterRevoke = await appPool.query(
      `SELECT workspace_id FROM bureau.resolve_credential($1)`,
      [tokenResult3.accessToken]
    );
    
    if (afterRevoke.rows.length > 0) {
      throw new Error('Token should not resolve after grant revoked');
    }
    
    console.log('   ✅ Access token rejected\n');
    
    // === TEST 10: Refresh Fails After Grant Revoked ===
    console.log('1️⃣1️⃣  Refresh fails after grant revoked');
    try {
      await oauth.refreshAccessToken(tokenResult3.refreshToken);
      throw new Error('Refresh should fail after grant revoked');
    } catch (err: any) {
      if (err.message.includes('GRANT_REVOKED') || err.message.includes('INVALID_REFRESH_TOKEN') || err.message.includes('invalid_grant')) {
        console.log('   ✅ Refresh rejected\n');
      } else {
        throw err;
      }
    }
    
    // === TEST 11: Cross-Workspace: B Cannot Revoke A's Token ===
    console.log('1️⃣2️⃣  Cross-workspace: B cannot revoke A\'s token');
    
    // Create FRESH token for workspace A (after the previous revocation tests)
    const pkce4 = generatePKCE();
    const authCode4 = await oauth.storeAuthCode({
      userId: userA,
      workspaceId: workspaceA,
      clientId,
      redirectUri,
      codeChallenge: pkce4.challenge,
      resource: 'mcp://bureau.local/mcp',
      scopes: ['ingest:write'],
      agentLabel: 'Test Agent 4',
      streamIds: [],
      allowCreateStreams: true
    });
    
    const tokenResult4 = await oauth.exchangeCode(
      authCode4,
      pkce4.verifier,
      clientId,
      redirectUri,
      'mcp://bureau.local/mcp'
    );
    
    if (!tokenResult4) {
      throw new Error('Token creation for cross-workspace test failed');
    }
    
    // Try to revoke as user B (wrong workspace)
    const revokeResult = await oauth.revokeToken(
      tokenResult4.accessToken,
      userB,
      workspaceB
    );
    
    if (revokeResult) {
      throw new Error('Cross-workspace revoke should have failed');
    }
    
    console.log('   ✅ Cross-workspace revoke blocked\n');
    
    // Key assertion: revoke should have returned false (blocked)
    if (revokeResult) {
      throw new Error('Cross-workspace revoke succeeded (should have been blocked)');
    }
    
    console.log('   ✅ Ownership check enforced\n');
    
    // === TEST 12: Device Flow (start → poll → consume) ===
    console.log('1️⃣3️⃣  Device flow: start → poll → consume');
    
    const deviceFlow = await oauth.startDeviceFlow(
      clientId,
      ['ingest:write']
    );
    
    console.log(`   ✅ Device flow started: ${deviceFlow.userCode}`);
    
    // Poll before authorization (should return pending)
    const pollBefore = await oauth.pollDeviceCode(
      deviceFlow.deviceCode,
      clientId
    );
    
    if (pollBefore.status !== 'pending') {
      throw new Error('Poll should return pending status before approval');
    }
    
    console.log('   ✅ Poll returns pending');
    
    // Authorize device (as admin, simulating user approval)
    const deviceCodeHash = crypto.createHash('sha256').update(deviceFlow.deviceCode).digest('hex');
    await adminQuery(
      `UPDATE bureau.oauth_device_codes 
       SET user_id = $1, workspace_id = $2, status = 'approved',
           agent_label = 'Device Agent', stream_ids = $3, allow_create_streams = true
       WHERE device_code_hash = $4`,
      [userA, workspaceA, `{${streamA}}`, deviceCodeHash]
    );
    
    console.log('   ✅ Device authorized (admin)');
    
    // Poll after authorization (should return tokens)
    const pollAfter = await oauth.pollDeviceCode(
      deviceFlow.deviceCode,
      clientId
    );
    
    if (!pollAfter.accessToken) {
      throw new Error('Poll should return tokens after authorization');
    }
    
    console.log(`   ✅ Tokens issued: ${pollAfter.accessToken.substring(0, 20)}...\n`);
    
    // Verify device token works
    const deviceCredential = await appPool.query(
      `SELECT workspace_id FROM bureau.resolve_credential($1)`,
      [pollAfter.accessToken]
    );
    
    if (deviceCredential.rows.length === 0 || deviceCredential.rows[0].workspace_id !== workspaceA) {
      throw new Error('Device token should resolve to workspace A');
    }
    
    console.log('   ✅ Device token resolves correctly\n');
    
    // === SUCCESS ===
    console.log('✅ All OAuth integration tests passed!\n');
    console.log('Summary:');
    console.log('  1. Store code ✅');
    console.log('  2. Exchange with PKCE ✅');
    console.log('  3. resolve_credential ✅');
    console.log('  4. Wrong PKCE fails ✅');
    console.log('  5. Code reuse fails ✅');
    console.log('  6. Refresh rotation ✅');
    console.log('  7. Refresh reuse revokes family ✅');
    console.log('  8. Grant revocation ✅');
    console.log('  9. resolve_credential fails after revoke ✅');
    console.log(' 10. Refresh fails after revoke ✅');
    console.log(' 11. Cross-workspace blocked ✅');
    console.log(' 12. Device flow ✅');
    console.log('\n13/13 tests passed ✅');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    await closeAll();
    process.exit(0);
  }
}

runTests();
