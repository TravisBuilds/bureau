import { Pool } from 'pg';

// Simple Postgres connection pool
// Works without Prisma client generation
// Lazy initialization to avoid creating pool during build
let _pool: Pool | null = null;

function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/bureau',
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
