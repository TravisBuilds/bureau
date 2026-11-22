# Deploy Bureau to Vercel + Supabase

**Target**: Vercel Hobby (free) + Supabase Free Tier

---

## Prerequisites

- Vercel account (free)
- Supabase account (free)
- GitHub repository

---

## Step 1: Create Supabase Project

### 1.1 Create Project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **New Project**
3. Enter:
   - **Name**: `bureau` (or your choice)
   - **Database Password**: Generate a strong password (save it!)
   - **Region**: Choose closest to your users
   - **Plan**: Free
4. Click **Create new project**
5. Wait ~2 minutes for provisioning

### 1.2 Get Connection String

1. Go to **Project Settings** > **Database**
2. Scroll to **Connection string**
3. Select **Session mode** (for Vercel serverless)
4. Copy the connection string
5. Replace `[YOUR-PASSWORD]` with your database password
6. Save as `DATABASE_URL` for later

### 1.3 Enable Auth

1. Go to **Authentication** > **Providers**
2. Enable **Email** provider
3. Configure:
   - Confirm email: **Disabled** (for pilot; enable later)
   - Secure email change: **Enabled**
   - Secure password change: **Enabled**

### 1.4 Get API Keys

1. Go to **Project Settings** > **API**
2. Copy these for later:
   - **Project URL**: `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public**: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role**: `SUPABASE_SERVICE_ROLE_KEY` (keep secret!)

---

## Step 2: Apply Database Migrations

### 2.1 Connect to Database

```bash
# Install Supabase CLI
brew install supabase/tap/supabase  # macOS
# or
npm install -g supabase              # npm

# Link to your project
supabase link --project-ref your-project-ref

# Or use psql directly with your connection string
psql "postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres"
```

### 2.2 Apply Migrations

**Option A: Via Supabase CLI (recommended)**

```bash
# Apply all migrations
supabase db push
```

**Option B: Via SQL Editor in Supabase Dashboard**

1. Go to **SQL Editor** in Supabase Dashboard
2. Apply migrations in order:
   - `supabase/migrations/20261122000000_initial_schema.sql`
   - `supabase/migrations/20261122000003_fix_rls_circular_dependency.sql`
   - `supabase/migrations/20261122000002_output_costs.sql`

**IMPORTANT**: Skip `20261122000001_auth_stubs.sql` - Supabase already has real `auth.users` and `auth.uid()`.

### 2.3 Verify Schema

```sql
-- Check tables
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Should see: workspaces, workspace_members, streams, output_costs, etc.

-- Check RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = 'public';

-- All tables should have rowsecurity = true
```

---

## Step 3: Seed Pilot Data

### 3.1 Create Pilot Invite Codes

```sql
INSERT INTO pilot_invites (code, expires_at)
VALUES 
  ('BUREAU_PILOT_001', '2027-12-31'),
  ('BUREAU_PILOT_002', '2027-12-31'),
  ('BUREAU_PILOT_003', '2027-12-31');
```

### 3.2 (Optional) Seed Travis's Workspace

After Travis signs up, get his user ID from Supabase:

```sql
-- Find Travis's user
SELECT id, email FROM auth.users WHERE email = 'travis@example.com';

-- Get his workspace
SELECT w.id, w.name FROM workspaces w
JOIN workspace_members wm ON wm.workspace_id = w.id
WHERE wm.user_id = '[travis-user-id]';

-- Then use scripts/seed-travis-workspace.sql with real IDs
```

---

## Step 4: Deploy to Vercel

### 4.1 Connect Repository

1. Go to [https://vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. Framework preset: **Next.js** (auto-detected)
4. Root directory: `./` (default)

### 4.2 Configure Environment Variables

Add these in Vercel project settings:

```bash
# Database
DATABASE_URL="postgresql://postgres:[password]@db.[ref].supabase.co:6543/postgres?pgbouncer=true"

# Supabase
NEXT_PUBLIC_SUPABASE_URL="https://[ref].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="[anon-key]"
SUPABASE_SERVICE_ROLE_KEY="[service-role-key]"

# Auth
NEXTAUTH_SECRET="[generate-with-openssl-rand-base64-32]"
NEXTAUTH_URL="https://your-project.vercel.app"

# Internal
BUREAU_MASTER_KEY="[generate-with-openssl-rand-base64-32]"
NODE_ENV="production"
```

**Generate secrets:**
```bash
# NEXTAUTH_SECRET
openssl rand -base64 32

# BUREAU_MASTER_KEY
openssl rand -base64 32
```

### 4.3 Deploy

1. Click **Deploy**
2. Wait ~2 minutes for build
3. Visit your URL: `https://your-project.vercel.app`

---

## Step 5: Post-Deployment Setup

### 5.1 Configure Supabase Auth Redirect

1. Go to Supabase **Authentication** > **URL Configuration**
2. Add **Site URL**: `https://your-project.vercel.app`
3. Add **Redirect URLs**:
   - `https://your-project.vercel.app/auth/callback`
   - `https://your-project.vercel.app/**` (wildcard)

### 5.2 Test Sign-Up Flow

1. Visit `https://your-project.vercel.app/auth/signup`
2. Enter email + invite code `BUREAU_PILOT_001`
3. Check email for magic link
4. Click link → should create workspace

### 5.3 Enable Email Sending (Production)

**Option A: Supabase Built-in SMTP** (Free tier: 3 emails/hour)
- Already enabled by default
- Limited rate for free tier

**Option B: Custom SMTP** (Recommended for production)
1. Go to **Project Settings** > **Auth** > **SMTP Settings**
2. Configure your SMTP provider (e.g., Resend, SendGrid)

---

## Step 6: Custom Domain (Optional)

### 6.1 Add Domain in Vercel

1. Go to Vercel Project Settings > **Domains**
2. Add your domain: `bureau.yourdomain.com`
3. Configure DNS as instructed

### 6.2 Update Environment Variables

```bash
NEXTAUTH_URL="https://bureau.yourdomain.com"
```

### 6.3 Update Supabase Redirect URLs

Add custom domain to Supabase Auth URL Configuration.

---

## Troubleshooting

### Build Fails

**Error: `PrismaClient is unable to run in Edge Runtime`**
- Not using Prisma Client, using raw SQL via `pg` ✓

**Error: `Cannot find module 'pg'`**
```bash
npm install pg
```

### Database Connection Fails

**Error: `Connection refused`**
- Check DATABASE_URL has correct password
- Use **Session pooler** (port 6543), not Direct connection (port 5432)
- Connection string should include `?pgbouncer=true`

### Auth Not Working

**Error: `Invalid redirect URL`**
- Add your Vercel URL to Supabase Auth redirect URLs
- Include wildcard: `https://your-project.vercel.app/**`

**Error: `No email sent`**
- Free tier: 3 emails/hour limit
- Check Supabase logs: **Authentication** > **Logs**

### RLS Errors

**Error: `new row violates row-level security policy`**
- User not in any workspace
- Run workspace creation after sign-up
- Check `auth.user_workspaces()` function exists

---

## Production Checklist

Before going live:

- [ ] Database migrations applied
- [ ] RLS policies enabled and tested
- [ ] Pilot invite codes created
- [ ] Environment variables set in Vercel
- [ ] Auth redirect URLs configured in Supabase
- [ ] Email sending tested
- [ ] Custom domain configured (optional)
- [ ] Rate limiting enabled (future)
- [ ] Error tracking enabled (future)
- [ ] Analytics enabled (future)

---

## Monitoring

### Supabase Dashboard

- **Database** > **Table Editor**: View data
- **Authentication** > **Users**: Manage users
- **Logs**: API requests, errors
- **Reports**: Performance metrics

### Vercel Dashboard

- **Deployments**: Build history
- **Functions**: Serverless function logs
- **Analytics**: Page views, performance
- **Logs**: Runtime errors

---

## Costs

**Free Tier Limits:**

**Supabase Free:**
- 500 MB database
- 1 GB bandwidth
- 50,000 monthly active users
- 2 GB file storage

**Vercel Hobby:**
- 100 GB bandwidth
- Unlimited deployments
- 100 GB-hours serverless function execution

**When to upgrade:**
- Supabase: >500 MB data or >1 GB bandwidth → $25/month
- Vercel: >100 GB bandwidth → $20/month

---

## Support

**Issues?**
- Supabase: [https://supabase.com/docs](https://supabase.com/docs)
- Vercel: [https://vercel.com/docs](https://vercel.com/docs)
- Bureau: Check `docs/TESTABILITY.md` and `docs/UNIT-ECONOMICS.md`
