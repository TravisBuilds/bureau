import { Pool } from 'pg';

// Simple Postgres connection pool
// Works without Prisma client generation
// Lazy initialization to avoid creating pool during build
let _pool: Pool | null = null;

function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/bureau',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
  return _pool;
}

// Helper to run queries
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

// Helper to run queries without returning rows
export async function execute(text: string, params?: any[]): Promise<void> {
  const pool = getPool();
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
