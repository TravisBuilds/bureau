/**
 * Integration test setup
 * Sets up real Postgres with all migrations applied
 */

import { Client } from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/bureau_test';

export async function setupDatabase() {
  const client = new Client({ connectionString: DATABASE_URL });
  
  try {
    await client.connect();
    
    // Check if already set up
    const check = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.schemata 
        WHERE schema_name = 'bureau'
      ) as exists
    `);
    
    if (check.rows[0].exists) {
      console.log('Database already initialized');
      return client;
    }
    
    console.log('Setting up database...');
    
    // Run dev stubs (auth.uid(), extensions)
    const devDir = join(process.cwd(), 'supabase', 'dev');
    const devFiles = readdirSync(devDir).filter(f => f.endsWith('.sql')).sort();
    
    for (const file of devFiles) {
      console.log(`Running dev stub: ${file}`);
      const sql = readFileSync(join(devDir, file), 'utf8');
      await client.query(sql);
    }
    
    // Run migrations in order
    const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
    const migrations = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql') && !f.includes('auth_stubs'))
      .sort();
    
    for (const migration of migrations) {
      console.log(`Running migration: ${migration}`);
      const sql = readFileSync(join(migrationsDir, migration), 'utf8');
      await client.query(sql);
    }
    
    // Create bureau_app role
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bureau_app') THEN
          CREATE ROLE bureau_app NOLOGIN;
        END IF;
      END $$;
    `);
    
    // Run setup-role.sql grants
    const setupRolePath = join(process.cwd(), 'supabase', 'setup-role.sql');
    try {
      const setupSql = readFileSync(setupRolePath, 'utf8');
      await client.query(setupSql);
    } catch (err) {
      console.log('No setup-role.sql found, skipping');
    }
    
    console.log('Database setup complete');
    return client;
    
  } catch (error) {
    console.error('Database setup failed:', error);
    await client.end();
    throw error;
  }
}

export async function cleanupDatabase(client: Client) {
  try {
    // Clean up test data
    await client.query('DROP SCHEMA IF EXISTS bureau CASCADE');
    await client.query('DROP SCHEMA IF EXISTS extensions CASCADE');
    await client.end();
  } catch (error) {
    console.error('Cleanup failed:', error);
  }
}

export async function createTestUser(client: Client, email: string, inviteCode?: string) {
  // Insert into auth.users (dev stub)
  const userResult = await client.query(
    `INSERT INTO auth.users (email, encrypted_password) 
     VALUES ($1, crypt('password', gen_salt('bf')))
     RETURNING id`,
    [email]
  );
  const userId = userResult.rows[0].id;
  
  if (inviteCode) {
    // Claim invite
    await client.query(
      `SELECT bureau.claim_pilot_invite($1, $2)`,
      [inviteCode, userId]
    );
  }
  
  // Set JWT claims for RLS
  await client.query(
    `SELECT set_config('request.jwt.claims', '{"sub":"${userId}","email":"${email}"}', false)`
  );
  await client.query(
    `SELECT set_config('request.jwt.claim.sub', '${userId}', false)`
  );
  
  return userId;
}
