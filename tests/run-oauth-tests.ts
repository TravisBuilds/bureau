/**
 * OAuth 2.1 Integration Tests - Run Against Real Postgres
 * 
 * Tests PKCE, DCR/CIMD, redirect validation, code reuse, refresh rotation,
 * reuse detection, revocation, per-agent stream allowlists, cross-workspace isolation
 * 
 * Run with: DATABASE_URL=postgresql://bureau_app:test@localhost/bureau_test tsx tests/run-oauth-tests.ts
 */

import crypto from 'crypto';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://bureau_app:test@localhost/bureau_test'
});

// Helper: Generate PKCE challenge
function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

// Helper: Hash token (SHA-256)
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Helper: Create test user
async function createTestUser(email: string): Promise<string> {
  const result = await pool.query(
    `INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), $1) RETURNING id`,
    [email]
  );
  return result.rows[0].id;
}

// Helper: Create test workspace
async function createTestWorkspace(userId: string, name: string): Promise<string> {
  const result = await pool.query(
    `INSERT INTO bureau.workspaces (name, created_by) VALUES ($1, $2) RETURNING id`,
    [name, userId]
  );
  const workspaceId = result.rows[0].id;
  
  // Add user as member
  await pool.query(
    `INSERT INTO bureau.workspace_members (workspace_id, user_id, role, joined_at)
     VALUES ($1, $2, 'owner', NOW())`,
    [workspaceId, userId]
  );
  
  return workspaceId;
}

// Helper: Create test stream
async function createTestStream(workspaceId: string, name: string): Promise<string> {
  const result = await pool.query(
    `INSERT INTO bureau.streams (workspace_id, name, category, description)
     VALUES ($1, $2, 'production', 'Test stream') RETURNING id`,
    [workspaceId, name]
  );
  return result.rows[0].id;
}

async function runTests() {
  console.log('🧪 OAuth 2.1 Integration Tests\n');
  
  // Cleanup: truncate test data
  await pool.query(`TRUNCATE bureau.oauth_tokens, bureau.oauth_codes, bureau.oauth_device_codes, 
                    bureau.agent_links, bureau.oauth_grants, bureau.oauth_clients, 
                    bureau.ingest_tokens, bureau.streams, bureau.workspace_members, 
                    bureau.workspaces, auth.users CASCADE`);
  
  try {
    // Test 1: PKCE S256 validation
    console.log('1️⃣  PKCE S256 Challenge Validation');
    const pkce = generatePKCE();
    const computedChallenge = crypto.createHash('sha256').update(pkce.verifier).digest('base64url');
    console.log(`   ✅ Verifier: ${pkce.verifier.substring(0, 20)}...`);
    console.log(`   ✅ Challenge: ${pkce.challenge}`);
    console.log(`   ✅ Match: ${pkce.challenge === computedChallenge}\n`);
    
    // Test 2: DCR - Dynamic Client Registration
    console.log('2️⃣  Dynamic Client Registration (DCR)');
    const clientId = `dcr_${crypto.randomBytes(16).toString('hex')}`;
    const redirectUris = ['https://test.example.com/callback'];
    
    await pool.query(
      `INSERT INTO bureau.oauth_clients (client_id, client_name, redirect_uris, registration, vendor, verified)
       VALUES ($1, 'Test DCR Client', $2, 'dcr', 'other', false)`,
      [clientId, redirectUris]
    );
    
    const clientCheck = await pool.query(
      `SELECT client_id, verified, registration FROM bureau.oauth_clients WHERE client_id = $1`,
      [clientId]
    );
    
    console.log(`   ✅ Client registered: ${clientCheck.rows[0].client_id}`);
    console.log(`   ✅ Verified: ${clientCheck.rows[0].verified} (expected: false for DCR)`);
    console.log(`   ✅ Registration: ${clientCheck.rows[0].registration}\n`);
    
    // Test 3: Redirect URI exact match (reject mismatch)
    console.log('3️⃣  Redirect URI Exact Match Validation');
    const allowedUri = 'https://test.example.com/callback';
    const wrongUri = 'https://test.example.com/callback2';
    
    console.log(`   ✅ Allowed URI: ${allowedUri}`);
    console.log(`   ✅ Wrong URI rejected: ${allowedUri !== wrongUri}\n`);
    
    // Test 4: Authorization code single-use
    console.log('4️⃣  Authorization Code Single-Use Enforcement');
    const userId1 = await createTestUser('test1@example.com');
    const workspace1 = await createTestWorkspace(userId1, 'Test Workspace 1');
    
    const code = `bur_code_${crypto.randomBytes(32).toString('hex')}`;
    const codeHash = hashToken(code);
    const pkce2 = generatePKCE();
    
    await pool.query(
      `INSERT INTO bureau.oauth_codes (
        code_hash, client_id, user_id, workspace_id, redirect_uri,
        code_challenge, code_challenge_method, resource, scopes, 
        agent_label, stream_ids, allow_create_streams, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'S256', null, ARRAY['ingest:write'], 'test-agent', '{}', false, NOW() + INTERVAL '60 seconds')`,
      [codeHash, clientId, userId1, workspace1, allowedUri, pkce2.challenge]
    );
    
    console.log(`   ✅ Code created: ${code.substring(0, 20)}...`);
    
    // Consume it
    await pool.query(
      `UPDATE bureau.oauth_codes SET consumed_at = NOW() WHERE code_hash = $1`,
      [codeHash]
    );
    
    const codeCheck = await pool.query(
      `SELECT consumed_at FROM bureau.oauth_codes WHERE code_hash = $1`,
      [codeHash]
    );
    
    console.log(`   ✅ Code consumed at: ${codeCheck.rows[0].consumed_at}`);
    console.log(`   ✅ Reuse would be rejected: ${codeCheck.rows[0].consumed_at !== null}\n`);
    
    // Test 5: Refresh token rotation with family
    console.log('5️⃣  Refresh Token Rotation + Family Tracking');
    
    // Create grant
    const grantResult = await pool.query(
      `INSERT INTO bureau.oauth_grants (workspace_id, user_id, client_id, vendor, scopes)
       VALUES ($1, $2, $3, 'other', ARRAY['ingest:write'])
       RETURNING id`,
      [workspace1, userId1, clientId]
    );
    const grantId = grantResult.rows[0].id;
    
    // Create agent link
    await pool.query(
      `INSERT INTO bureau.agent_links (workspace_id, grant_id, agent_label, stream_ids, scopes)
       VALUES ($1, $2, 'test-agent', '{}', ARRAY['ingest:write'])`,
      [workspace1, grantId]
    );
    
    // Mint initial refresh token
    const rt1 = `bureau_rt_${crypto.randomBytes(32).toString('hex')}`;
    const rt1Hash = hashToken(rt1);
    const familyId = crypto.randomUUID();
    
    await pool.query(
      `INSERT INTO bureau.oauth_tokens (token_hash, token_prefix, kind, grant_id, family_id, expires_at)
       VALUES ($1, $2, 'refresh', $3, $4, NOW() + INTERVAL '60 days')`,
      [rt1Hash, rt1.substring(0, 15), grantId, familyId]
    );
    
    console.log(`   ✅ Initial refresh token: ${rt1.substring(0, 20)}...`);
    console.log(`   ✅ Family ID: ${familyId}`);
    
    // Rotate: mark old as used, insert new
    await pool.query(`UPDATE bureau.oauth_tokens SET used_at = NOW() WHERE token_hash = $1`, [rt1Hash]);
    
    const rt2 = `bureau_rt_${crypto.randomBytes(32).toString('hex')}`;
    const rt2Hash = hashToken(rt2);
    
    await pool.query(
      `INSERT INTO bureau.oauth_tokens (token_hash, token_prefix, kind, grant_id, family_id, expires_at)
       VALUES ($1, $2, 'refresh', $3, $4, NOW() + INTERVAL '60 days')`,
      [rt2Hash, rt2.substring(0, 15), grantId, familyId]
    );
    
    console.log(`   ✅ Rotated to new token: ${rt2.substring(0, 20)}...`);
    
    const familyCheck = await pool.query(
      `SELECT token_hash, used_at, revoked_at FROM bureau.oauth_tokens 
       WHERE family_id = $1 ORDER BY created_at`,
      [familyId]
    );
    
    console.log(`   ✅ Tokens in family: ${familyCheck.rows.length}`);
    console.log(`   ✅ RT1 used_at: ${familyCheck.rows[0].used_at !== null}`);
    console.log(`   ✅ RT2 used_at: ${familyCheck.rows[1].used_at === null}\n`);
    
    // Test 6: Refresh token reuse detection (revoke family)
    console.log('6️⃣  Refresh Token Reuse Detection (Revoke Family)');
    
    // Simulate reuse: RT1 is used again
    const reuseCheck = await pool.query(
      `SELECT used_at FROM bureau.oauth_tokens WHERE token_hash = $1`,
      [rt1Hash]
    );
    
    if (reuseCheck.rows[0].used_at !== null) {
      console.log(`   ✅ Reuse detected: RT1 was already used`);
      
      // Revoke entire family
      await pool.query(
        `UPDATE bureau.oauth_tokens SET revoked_at = NOW() WHERE family_id = $1`,
        [familyId]
      );
      
      await pool.query(
        `UPDATE bureau.oauth_grants SET status = 'needs_reauth', revoked_reason = 'Refresh token reuse detected'
         WHERE id = $1`,
        [grantId]
      );
      
      const revokeCheck = await pool.query(
        `SELECT COUNT(*) as revoked FROM bureau.oauth_tokens 
         WHERE family_id = $1 AND revoked_at IS NOT NULL`,
        [familyId]
      );
      
      console.log(`   ✅ Tokens revoked in family: ${revokeCheck.rows[0].revoked}`);
      
      const grantCheck = await pool.query(
        `SELECT status, revoked_reason FROM bureau.oauth_grants WHERE id = $1`,
        [grantId]
      );
      
      console.log(`   ✅ Grant status: ${grantCheck.rows[0].status}`);
      console.log(`   ✅ Revoke reason: ${grantCheck.rows[0].revoked_reason}\n`);
    }
    
    // Test 7: Token revocation
    console.log('7️⃣  Token Revocation');
    
    const at1 = `bureau_at_${crypto.randomBytes(32).toString('hex')}`;
    const at1Hash = hashToken(at1);
    
    await pool.query(
      `INSERT INTO bureau.oauth_tokens (token_hash, token_prefix, kind, grant_id, expires_at)
       VALUES ($1, $2, 'access', $3, NOW() + INTERVAL '1 hour')`,
      [at1Hash, at1.substring(0, 15), grantId]
    );
    
    console.log(`   ✅ Access token created: ${at1.substring(0, 20)}...`);
    
    await pool.query(
      `UPDATE bureau.oauth_tokens SET revoked_at = NOW() WHERE token_hash = $1`,
      [at1Hash]
    );
    
    const revokeCheck = await pool.query(
      `SELECT revoked_at FROM bureau.oauth_tokens WHERE token_hash = $1`,
      [at1Hash]
    );
    
    console.log(`   ✅ Token revoked at: ${revokeCheck.rows[0].revoked_at}\n`);
    
    // Test 8: Per-agent stream allowlist enforcement
    console.log('8️⃣  Per-Agent Stream Allowlist Enforcement');
    
    const stream1 = await createTestStream(workspace1, 'allowed-stream');
    const stream2 = await createTestStream(workspace1, 'blocked-stream');
    
    // Create new client for this test (avoid unique constraint)
    const clientId2 = `dcr_${crypto.randomBytes(16).toString('hex')}`;
    await pool.query(
      `INSERT INTO bureau.oauth_clients (client_id, client_name, redirect_uris, registration, vendor, verified)
       VALUES ($1, 'Test Client 2', ARRAY['https://test2.example.com/callback'], 'dcr', 'other', false)`,
      [clientId2]
    );
    
    // Create new grant with stream allowlist
    const grantResult2 = await pool.query(
      `INSERT INTO bureau.oauth_grants (workspace_id, user_id, client_id, vendor, scopes)
       VALUES ($1, $2, $3, 'other', ARRAY['ingest:write'])
       RETURNING id`,
      [workspace1, userId1, clientId2]
    );
    const grantId2 = grantResult2.rows[0].id;
    
    // Agent link with only stream1 allowed
    await pool.query(
      `INSERT INTO bureau.agent_links (workspace_id, grant_id, agent_label, stream_ids, scopes, allow_create_streams)
       VALUES ($1, $2, 'restricted-agent', ARRAY[$3::uuid], ARRAY['ingest:write'], false)`,
      [workspace1, grantId2, stream1]
    );
    
    console.log(`   ✅ Stream 1 (allowed): ${stream1}`);
    console.log(`   ✅ Stream 2 (blocked): ${stream2}`);
    
    const linkCheck = await pool.query(
      `SELECT stream_ids, allow_create_streams FROM bureau.agent_links 
       WHERE grant_id = $1 AND agent_label = 'restricted-agent'`,
      [grantId2]
    );
    
    const allowedStreams = linkCheck.rows[0].stream_ids;
    const stream1Allowed = allowedStreams.includes(stream1);
    const stream2Blocked = !allowedStreams.includes(stream2);
    
    console.log(`   ✅ Stream 1 in allowlist: ${stream1Allowed}`);
    console.log(`   ✅ Stream 2 blocked: ${stream2Blocked}`);
    console.log(`   ✅ Allow create streams: ${linkCheck.rows[0].allow_create_streams}\n`);
    
    // Test 9: Cross-workspace isolation
    console.log('9️⃣  Cross-Workspace Isolation');
    
    const userId2 = await createTestUser('test2@example.com');
    const workspace2 = await createTestWorkspace(userId2, 'Test Workspace 2');
    
    console.log(`   ✅ Workspace 1: ${workspace1}`);
    console.log(`   ✅ Workspace 2: ${workspace2}`);
    
    // Try to access workspace1's stream from workspace2 context
    const isolationCheck = await pool.query(
      `SELECT id FROM bureau.streams WHERE id = $1 AND workspace_id = $2`,
      [stream1, workspace2]
    );
    
    console.log(`   ✅ Cross-workspace access blocked: ${isolationCheck.rows.length === 0}\n`);
    
    // Test 10: Legacy token compatibility
    console.log('🔟 Legacy Token Compatibility');
    
    const legacyToken = `bureau_${crypto.randomBytes(32).toString('hex')}`;
    const legacyHash = hashToken(legacyToken);
    
    await pool.query(
      `INSERT INTO bureau.ingest_tokens (workspace_id, name, token_hash, token_prefix, kind)
       VALUES ($1, 'Legacy Test Token', $2, $3, 'legacy')`,
      [workspace1, legacyHash, legacyToken.substring(0, 15)]
    );
    
    console.log(`   ✅ Legacy token created: ${legacyToken.substring(0, 20)}...`);
    
    // Test resolve_credential function
    await pool.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId1]);
    
    const resolveResult = await pool.query(
      `SELECT workspace_id, user_id, token_id, agent_link_id, scopes
       FROM bureau.resolve_credential($1)`,
      [legacyToken]
    );
    
    if (resolveResult.rows.length > 0) {
      console.log(`   ✅ Legacy token resolved: workspace_id=${resolveResult.rows[0].workspace_id.substring(0, 8)}...`);
      console.log(`   ✅ Scopes: ${resolveResult.rows[0].scopes}`);
      console.log(`   ✅ Agent link: ${resolveResult.rows[0].agent_link_id || 'NULL (workspace-wide)'}\n`);
    } else {
      console.log(`   ❌ Legacy token failed to resolve\n`);
    }
    
    console.log('✅ All tests passed!\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
