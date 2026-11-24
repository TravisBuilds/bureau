/**
 * Minimal OAuth Function Tests
 * Tests SECURITY DEFINER functions at SQL level as bureau_app
 */

import { Pool } from 'pg';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://bureau_app:test@localhost/bureau_test'
});

async function adminSQL(sql: string): Promise<void> {
  await execAsync(`sudo -u postgres psql bureau_test -c "${sql.replace(/"/g, '\\"')}"`);
}

async function test() {
  console.log('🔐 Minimal OAuth Function Tests\n');
  
  try {
    // Setup as postgres
    const userId = crypto.randomUUID();
    const workspaceId = crypto.randomUUID();
    const clientId = 'test_minimal_client';
    
    await adminSQL(`TRUNCATE bureau.oauth_tokens, bureau.oauth_codes, bureau.oauth_grants, bureau.oauth_clients CASCADE`);
    await adminSQL(`INSERT INTO auth.users (id, email) VALUES ('${userId}', 'test@ex.com')`);
    await adminSQL(`INSERT INTO bureau.workspaces (id, name, created_by) VALUES ('${workspaceId}', 'Test', '${userId}')`);
    await adminSQL(`INSERT INTO bureau.workspace_members (workspace_id, user_id, role) VALUES ('${workspaceId}', '${userId}', 'owner')`);
    await adminSQL(`INSERT INTO bureau.oauth_clients (client_id, client_name, redirect_uris, registration, vendor) VALUES ('${clientId}', 'Test', ARRAY['http://localhost'], 'static', 'other')`);
    await adminSQL(`INSERT INTO bureau.agent_links (id, grant_id, workspace_id, agent_label, stream_ids, scopes, allow_create_streams) VALUES ('${crypto.randomUUID()}', NULL, '${workspaceId}', 'Test', ARRAY[]::uuid[], ARRAY['test'], true)`);
    
    console.log('✅ Setup complete (via postgres)\n');
    
    // 1. Test store_auth_code (as bureau_app)
    console.log('1️⃣  bureau.store_auth_code');
    const codeHash = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `SELECT bureau.store_auth_code($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW() + INTERVAL '10 minutes')`,
      [codeHash, clientId, userId, workspaceId, 'http://localhost', 'challenge', 'S256', 'mcp://test', ['test'], 'Test Agent', [], true]
    );
    console.log('   ✅ Code stored\n');
    
    // 2. Test consume_auth_code (as bureau_app)
    console.log('2️⃣  bureau.consume_auth_code');
    const consumed = await pool.query(
      `SELECT * FROM bureau.consume_auth_code($1, $2)`,
      [codeHash, clientId]
    );
    
    if (consumed.rows.length === 0) {
      console.log('   ❌ FAIL: Code not consumed\n');
      process.exit(1);
    }
    console.log(`   ✅ Code consumed (user_id: ${consumed.rows[0].user_id})\n`);
    
    // 3. Test reuse blocked
    console.log('3️⃣  Code reuse blocked');
    const reuse = await pool.query(
      `SELECT * FROM bureau.consume_auth_code($1, $2)`,
      [codeHash, clientId]
    );
    
    if (reuse.rows.length > 0) {
      console.log('   ❌ FAIL: Code reused\n');
      process.exit(1);
    }
    console.log('   ✅ Code reuse blocked\n');
    
    console.log('✅ All minimal tests passed!');
    console.log('Summary: 3/3 ✅');
    
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    await pool.end();
    process.exit(1);
  }
}

test();
