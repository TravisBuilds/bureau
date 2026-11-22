import { Pool } from 'pg';

// Simple Postgres connection pool
// Works without Prisma client generation
// Lazy initialization to avoid creating pool during build
let _pool: Pool | null = null;
let _adminPool: Pool | null = null;

function getPool(): Pool {
  if (!_pool) {
    const connStr = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/bureau';
    console.log('[DB] Creating pool with:', connStr.replace(/:[^:@]+@/, ':****@'));
    _pool = new Pool({
      connectionString: connStr,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    // Set search_path to bureau schema for all connections
    _pool.on('connect', (client) => {
      client.query('SET search_path TO bureau, extensions, auth', (err) => {
        if (err) console.error('Failed to set search_path:', err);
      });
    });
  }
  return _pool;
}

function getAdminPool(): Pool {
  if (!_adminPool) {
    const connStr = process.env.DATABASE_URL_ADMIN || 'postgresql://postgres:postgres@localhost:5432/bureau';
    console.log('[DB] Creating admin pool with:', connStr.replace(/:[^:@]+@/, ':****@'));
    _adminPool = new Pool({
      connectionString: connStr,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    // Set search_path to bureau schema for all admin connections
    _adminPool.on('connect', (client) => {
      client.query('SET search_path TO bureau, extensions, auth', (err) => {
        if (err) console.error('Failed to set search_path on admin pool:', err);
      });
    });
  }
  return _adminPool;
}

// Helper to run queries (uses RLS-enforced connection)
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result.rows;
  } finally {
    client.release();
  }
}

// Helper to run queries without returning rows (uses RLS-enforced connection)
export async function execute(text: string, params?: any[]): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(text, params);
  } finally {
    client.release();
  }
}

// Admin queries (bypass RLS - for migrations and tests only!)
export async function queryAdmin<T = any>(text: string, params?: any[]): Promise<T[]> {
  const pool = getAdminPool();
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result.rows;
  } finally {
    client.release();
  }
}

export async function executeAdmin(text: string, params?: any[]): Promise<void> {
  const pool = getAdminPool();
  const client = await pool.connect();
  try {
    await client.query(text, params);
  } finally {
    client.release();
  }
}

// Helper to run queries with RLS context (maintains same connection)
export async function queryWithUser<T = any>(userId: string, text: string, params?: any[]): Promise<T[]> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    // Set the user context
    await client.query('SELECT auth.set_user($1::uuid)', [userId]);
    // Verify it was set
    const uidCheck = await client.query('SELECT auth.uid()');
    if (uidCheck.rows[0].uid !== userId) {
      console.warn(`WARNING: auth.uid() = ${uidCheck.rows[0].uid}, expected ${userId}`);
    }
    // Run the query in the same connection
    const result = await client.query(text, params);
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Run queries in a transaction with proper JWT claims set (works in production RLS)
 * Sets transaction-local request.jwt.claims for auth.uid() to work
 * Safe on both Session Mode and Transaction Pooler
 */
export async function withUser<T>(
  userId: string,
  email: string,
  fn: (client: any) => Promise<T>
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Set JWT claims for auth.uid() - transaction-local (safe on pooler)
    const claims = JSON.stringify({
      sub: userId,
      email: email,
      role: 'authenticated',
      aud: 'authenticated'
    });
    
    await client.query('SELECT set_config($1, $2, true)', ['request.jwt.claims', claims]);
    await client.query('SELECT set_config($1, $2, true)', ['request.jwt.claim.sub', userId]);
    
    // Run the user's function
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
