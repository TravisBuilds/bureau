/**
 * OAuth Integration Tests (Hardened)
 * Uses admin pool for setup, app pool for execution
 * 
 * Run: DATABASE_URL=postgresql://bureau_app:test@localhost/bureau_test npx tsx tests/run-oauth-tests-hardened.ts
 */

import crypto from 'crypto';
import { adminQuery, appPool, cleanupTests, closeAll } from './test-db';
import * as oauth from '../lib/oauth-server';

const TEST_CLIENT = {
  client_id: 'test_oauth_client',
  client_name: 'Test OAuth Client',
  redirect_uris: ['https://example.com/callback'],
  vendor: 'other' as const,
  verified: false
};

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

async function runTests() {
  console.log('🔐 OAuth Integration Tests (Hardened)\n');
  
  try {
    await cleanupTests();
    
    // Setup test data as admin
    const userId = crypto.randomUUID();
    const workspaceId = crypto.randomUUID();
    
    await adminQuery(`INSERT INTO auth.users (id, email) VALUES ($1, 'test@example.com')`, [userId]);
    await adminQuery(`INSERT INTO bureau.workspaces (id, name, created_by) VALUES ($1, 'Test Workspace', $2)`, [workspaceId, userId]);
    await adminQuery(`INSERT INTO bureau.workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [workspaceId, userId]);
    await adminQuery(
      `INSERT INTO bureau.oauth_clients (client_id, client_name, redirect_uris, registration, vendor, verified)
       VALUES ($1, $2, $3, 'static', $4, $5)`,
      [TEST_CLIENT.client_id, TEST_CLIENT.client_name, `{${TEST_CLIENT.redirect_uris.join(',')}}`, TEST_CLIENT.vendor, TEST_CLIENT.verified]
    );
    
    console.log('1️⃣  Authorization Code Flow (store code → exchange → refresh)\n');
    
    // Store auth code (via SECURITY DEFINER function)
    const code = `bureau_code_${crypto.randomBytes(32).toString('hex')}`;
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const redirectUri = TEST_CLIENT.redirect_uris[0];
    
    const storedCode = await oauth.storeAuthCode({
      userId,
      workspaceId,
      clientId: TEST_CLIENT.client_id,
      redirectUri,
      codeChallenge,
      resource: 'mcp://bureau.local/mcp',
      scopes: ['ingest:write'],
      agentLabel: 'Test Agent',
      streamIds: [],
      allowCreateStreams: true
    });
    
    console.log('   ✅ Code stored via bureau.store_auth_code');
    console.log(`   ✅ Generated code: ${storedCode.substring(0, 20)}...`);
    
    // Exchange code for tokens (via SECURITY DEFINER function consume_auth_code)
    const tokenResult = await oauth.exchangeCode(storedCode, {
      clientId: TEST_CLIENT.client_id,
      redirectUri,
      codeVerifier
    });
    
    if (!tokenResult) {
      console.log('   ❌ FAIL: Code exchange failed\n');
      process.exit(1);
    }
    
    console.log('   ✅ Code exchanged via bureau.consume_auth_code');
    console.log(`   ✅ Access token: ${tokenResult.access_token.substring(0, 20)}...`);
    console.log(`   ✅ Refresh token: ${tokenResult.refresh_token?.substring(0, 20)}...\n`);
    
    const { access_token, refresh_token } = tokenResult;
    
    // Test access token via resolve_credential
    const credential = await appPool.query(
      `SELECT workspace_id, user_id FROM bureau.resolve_credential($1)`,
      [access_token]
    );
    
    if (credential.rows.length === 0 || credential.rows[0].workspace_id !== workspaceId) {
      console.log('   ❌ FAIL: Access token resolution failed\n');
      process.exit(1);
    }
    
    console.log('2️⃣  Access Token Resolution\n');
    console.log('   ✅ Token resolves to correct workspace\n');
    
    // Test refresh token rotation
    console.log('3️⃣  Refresh Token Rotation\n');
    
    const refreshResult = await oauth.refreshToken(refresh_token!, {
      clientId: TEST_CLIENT.client_id
    });
    
    if (!refreshResult) {
      console.log('   ❌ FAIL: Refresh failed\n');
      process.exit(1);
    }
    
    console.log('   ✅ Refresh succeeded');
    console.log(`   ✅ New access token: ${refreshResult.access_token.substring(0, 20)}...\n`);
    
    // Test old refresh token is consumed (should fail on reuse)
    console.log('4️⃣  Refresh Token Reuse Detection\n');
    
    try {
      await oauth.refreshToken(refresh_token!, {
        clientId: TEST_CLIENT.client_id
      });
      console.log('   ❌ FAIL: Old refresh token reuse should be blocked\n');
      process.exit(1);
    } catch (err: any) {
      if (err.message?.includes('INVALID_REFRESH_TOKEN') || err.message?.includes('invalid_grant')) {
        console.log('   ✅ Refresh reuse blocked\n');
      } else {
        console.log('   ❌ Wrong error:', err.message, '\n');
        process.exit(1);
      }
    }
    
    // Test token revocation
    console.log('5️⃣  Token Revocation\n');
    
    const revokeResult = await oauth.revokeToken(refreshResult.access_token, {
      userId,
      workspaceId
    });
    
    if (!revokeResult) {
      console.log('   ❌ FAIL: Revocation failed\n');
      process.exit(1);
    }
    
    console.log('   ✅ Token revoked via bureau.revoke_oauth_token');
    
    // Verify revoked token doesn't work
    const afterRevoke = await appPool.query(
      `SELECT workspace_id FROM bureau.resolve_credential($1)`,
      [refreshResult.access_token]
    );
    
    if (afterRevoke.rows.length > 0) {
      console.log('   ❌ FAIL: Revoked token still works\n');
      process.exit(1);
    }
    
    console.log('   ✅ Revoked token rejected by resolve_credential\n');
    
    console.log('✅ All OAuth integration tests passed!\n');
    
    // Test counts
    console.log('Summary: 5 test groups, all passing');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    await closeAll();
    process.exit(0);
  }
}

runTests();
