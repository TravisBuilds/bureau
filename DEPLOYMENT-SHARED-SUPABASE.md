# Bureau Deployment Guide - Shared Supabase Project

Bureau is designed to coexist with other applications (like PulseCheck) in the same Supabase project. All Bureau objects live in the `bureau` schema.

## Critical: What Bureau NEVER Touches

- ❌ **auth.users** - Supabase Auth owns this, Bureau only reads it
- ❌ **auth.sessions** - Supabase Auth manages sessions
- ❌ **public schema** - PulseCheck or other apps own this
- ✅ **bureau schema** - Bureau owns this completely

## Migration Strategy

### Production Migrations (Run in Order)
```sql
-- 1. 20261122000000_initial_schema.sql
--    Creates bureau schema, all tables, RLS policies

-- 2. 20261122000002_output_costs.sql
--    Adds output cost tracking

-- 3. 20261122000003_fix_rls_circular_dependency.sql
--    Creates bureau.user_workspaces() SECURITY DEFINER function

-- 4. 20261122000004_output_lifecycle.sql
--    Adds lifecycle fields to output_costs

-- 5. 20261122000005_create_app_role.sql
--    Grants privileges to bureau_app role
```

### Local Dev Only (DO NOT RUN IN PRODUCTION)
```bash
# supabase/dev/auth_stubs.sql
# Creates mock auth.users and auth.set_user() for RLS testing
# Only needed if running local Postgres without Supabase
```

## Role Setup (One-Time)

### 1. Create the bureau_app Role
Run this in Supabase SQL Editor (replace YOUR_SECURE_PASSWORD):

```sql
-- From supabase/setup-role.sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bureau_app') THEN
    CREATE ROLE bureau_app WITH LOGIN PASSWORD 'YOUR_SECURE_PASSWORD';
    RAISE NOTICE 'Created bureau_app role';
  ELSE
    RAISE NOTICE 'bureau_app role already exists';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE postgres TO bureau_app;
```

**Store the password securely** - you'll need it for the connection string.

### 2. Run Migration 000005
After creating the role, run migration `20261122000005_create_app_role.sql` to grant privileges:
- USAGE on bureau and extensions schemas
- SELECT, INSERT, UPDATE, DELETE on all bureau tables
- EXECUTE on all bureau functions
- Sets default search_path = bureau, extensions

## Connection Strings

### Standard Connection (Uses bureau_app role)
```bash
# Production connection string format
DATABASE_URL=postgresql://bureau_app:PASSWORD@db.PROJECT.supabase.co:5432/postgres

# Admin connection (same role, used for migrations/tests)
DATABASE_URL_ADMIN=postgresql://bureau_app:PASSWORD@db.PROJECT.supabase.co:5432/postgres
```

### Why Not Connection Pooler?
Bureau needs to:
- Set auth context for RLS (`auth.uid()`)
- Call SECURITY DEFINER functions
- These require session-level state, not transaction pooling

Use **Session Mode** (port 5432), not Transaction Mode (port 6543).

### Connection String Options (Optional)
If your Supabase project has multiple schemas:

```bash
# Explicitly set search_path in connection string
DATABASE_URL=postgresql://bureau_app:PASSWORD@db.PROJECT.supabase.co:5432/postgres?options=-c%20search_path%3Dbureau%2Cextensions

# Note: The app also sets search_path on connect, so this is redundant but explicit
```

## Vercel Environment Variables

```bash
# Database (Session Mode, bureau_app role)
DATABASE_URL=postgresql://bureau_app:PASSWORD@db.PROJECT.supabase.co:5432/postgres
DATABASE_URL_ADMIN=postgresql://bureau_app:PASSWORD@db.PROJECT.supabase.co:5432/postgres

# Supabase Auth (for magic links)
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Your site URL (for redirect links)
NEXT_PUBLIC_SITE_URL=https://bureau.yourdomain.com

# Encryption key (32+ chars)
BUREAU_ENCRYPTION_KEY=your-32-char-encryption-key-here
```

## Schema Isolation Verification

After deployment, verify Bureau is properly isolated:

```sql
-- 1. Check Bureau objects are in bureau schema
SELECT schemaname, tablename 
FROM pg_tables 
WHERE schemaname = 'bureau';

-- Expected: workspaces, streams, ingest_tokens, etc.

-- 2. Verify bureau_app cannot write to auth/public
SELECT has_schema_privilege('bureau_app', 'auth', 'CREATE');
-- Expected: false

SELECT has_schema_privilege('bureau_app', 'public', 'CREATE');
-- Expected: false

-- 3. Test RLS works with Supabase auth
-- Sign in as a user, then:
SELECT auth.uid();
-- Expected: your user UUID

SELECT * FROM bureau.workspaces;
-- Expected: only your workspaces (RLS enforced)
```

## Migration Checklist

- [ ] **1. Create bureau_app role** in Supabase SQL Editor
- [ ] **2. Store password** in secure vault
- [ ] **3. Run migrations 000000-000005** in order
- [ ] **4. Seed pilot invites** (`supabase/seed.sql`)
- [ ] **5. Set Vercel env vars** (DATABASE_URL with bureau_app role)
- [ ] **6. Configure Supabase Auth** redirect URLs
- [ ] **7. Test sign-in flow** (magic link → workspace creation)
- [ ] **8. Verify RLS isolation** (can't see other workspaces)

## Local Development Setup

```bash
# 1. Use local Postgres or Supabase CLI
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bureau

# 2. Run production migrations
psql $DATABASE_URL -f supabase/migrations/20261122000000_initial_schema.sql
psql $DATABASE_URL -f supabase/migrations/20261122000002_output_costs.sql
psql $DATABASE_URL -f supabase/migrations/20261122000003_fix_rls_circular_dependency.sql
psql $DATABASE_URL -f supabase/migrations/20261122000004_output_lifecycle.sql
psql $DATABASE_URL -f supabase/migrations/20261122000005_create_app_role.sql

# 3. Run dev-only auth stubs (for RLS testing without Supabase)
psql $DATABASE_URL -f supabase/dev/auth_stubs.sql

# 4. Seed data
psql $DATABASE_URL -f supabase/seed.sql

# 5. Omit Supabase env vars to use LocalAuthAdapter
# Magic links will log to console
```

## Search Path Details

Bureau sets `search_path = bureau, extensions, auth` on every connection:
- **bureau**: Bureau tables (default schema for unqualified queries)
- **extensions**: uuid-ossp and other extensions
- **auth**: Supabase Auth (read-only: users, uid())

This means queries can write:
```sql
-- Works (searches bureau schema first)
SELECT * FROM workspaces;

-- Also works (explicit)
SELECT * FROM bureau.workspaces;

-- Works (auth.uid() for RLS)
SELECT auth.uid();

-- Blocked (no write access to auth)
INSERT INTO auth.users (...) -- ERROR
```

## Troubleshooting

### "permission denied for schema public"
**Cause**: App is trying to write to public schema  
**Fix**: Verify all queries use `bureau.` prefix or rely on search_path

### "relation 'workspaces' does not exist"
**Cause**: Search path not set  
**Fix**: Check db.ts connection setup, verify `SET search_path TO bureau, extensions` runs on connect

### "auth.uid() does not exist"
**Cause**: Running locally without auth stubs  
**Fix**: Run `supabase/dev/auth_stubs.sql`

### "INSERT INTO auth.users failed"
**Cause**: Code trying to create auth users  
**Fix**: Remove any `INSERT INTO auth.users` - Supabase Auth owns that table

### Users logged out after 1 hour
**Cause**: Only storing access_token without refresh token  
**Fix**: This is now fixed - using @supabase/ssr with proper refresh token handling

## Security Notes

1. **bureau_app role** has full access to bureau schema but CANNOT:
   - Write to auth.* tables
   - Write to public.* tables
   - Create new schemas
   - Bypass RLS (policies still apply)

2. **RLS policies** enforce workspace isolation:
   - Users only see their own workspaces
   - `auth.uid()` from Supabase JWT identifies the user
   - `bureau.user_workspaces()` SECURITY DEFINER bypasses circular RLS

3. **FKs to auth.users** are safe:
   - Bureau reads auth.users(id) for FK validation
   - Bureau NEVER writes to auth.users
   - Supabase Auth creates users via signInWithOtp

## Support

For deployment issues:
1. Check migration order (000000 → 000005)
2. Verify bureau_app role exists and has correct password
3. Test connection: `psql $DATABASE_URL -c "SELECT current_schema()"`
4. Verify RLS: `SELECT auth.uid(), bureau.user_workspaces()`
