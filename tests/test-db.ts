/**
 * Test Database Helpers
 * Uses psql for admin operations, Pool for app testing
 */

import { Pool } from 'pg';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// App connection (bureau_app role) for testing actual code
export const appPool = new Pool({
  connectionString: process.env.DATABASE_URL || 
                    'postgresql://bureau_app:test@localhost/bureau_test',
  max: 5
});

// Execute SQL as postgres admin via psql
export async function adminQuery(sql: string, params?: any[]): Promise<any> {
  let query = sql;
  if (params) {
    // Simple param substitution for tests (not SQL injection safe, only for tests!)
    params.forEach((param, i) => {
      const placeholder = `$${i + 1}`;
      const value = typeof param === 'string' ? `'${param.replace(/'/g, "''")}'` : param;
      query = query.replace(placeholder, String(value));
    });
  }
  
  const { stdout, stderr } = await execAsync(
    `sudo -u postgres psql bureau_test -c "${query.replace(/"/g, '\\"')}"`
  );
  
  if (stderr && !stderr.includes('NOTICE')) {
    throw new Error(stderr);
  }
  
  return { rows: [] }; // psql doesn't return structured data easily
}

export async function cleanupTests() {
  await adminQuery(`
    TRUNCATE bureau.oauth_tokens, bureau.oauth_codes, bureau.oauth_device_codes, 
             bureau.agent_links, bureau.oauth_grants, bureau.oauth_clients, 
             bureau.ingest_tokens, bureau.streams, bureau.workspace_members, 
             bureau.workspaces, auth.users CASCADE
  `);
}

export async function closeAll() {
  await appPool.end();
}
