# Bureau Testability Architecture

**Version:** 1.0  
**Date:** November 22, 2026  
**Status:** Foundation in progress

## Overview

This document defines Bureau's architecture for pilot testing with 5 operators. Everything runs locally and in CI. No deploys, paid services, or real OAuth apps without Travis's approval.

## Critical Note: Costs and Rules Tabs

**Status:** ❌ NOT YET BUILT

The Costs and Rules tabs do NOT yet exist for the four current streams (DuckDuckGoose, Elon, Studio, Ember). Only demo pages exist (`/stream-costs-demo`, `/stream-rules-demo` for Plum List).

**Required:**
- `/stream/[id]/costs` page for each stream
- `/stream/[id]/rules` page for each stream
- Empty states: "No costs tracked yet" with "Connect usage source" CTA
- Empty states: "No automation rules" with "Create rule" button

**Will be built in this phase.**

---

## 1. Auth System Choice: Supabase Auth

**Decision:** Use **Supabase Auth** for authentication.

### Justification

**Pros:**
1. ✅ **Travis has Supabase connector** — already familiar, reduces learning curve
2. ✅ **Free tier sufficient** for pilot (50,000 MAU)
3. ✅ **Email magic links + OAuth** built-in (Google, GitHub, etc.)
4. ✅ **Row-Level Security (RLS)** native to Postgres, perfect for workspace isolation
5. ✅ **Local development** with Supabase CLI + Docker
6. ✅ **Session management** handled server-side
7. ✅ **No paid external service** required (can self-host or use free tier)

**Cons:**
1. ⚠️ Requires Supabase project creation (Travis must approve)
2. ⚠️ Vendor lock-in (but can migrate to raw Postgres + Auth.js if needed)

**Alternative Considered:** Auth.js (NextAuth)
- More control, no vendor lock-in
- But requires separate database setup, email provider, session management
- More code to write and maintain
- **Conclusion:** Supabase Auth is better fit given Travis's connector and RLS needs

### Implementation Plan

**Local Development:**
- Supabase CLI + Docker (no cloud project needed)
- `npx supabase init` → local Postgres + Auth
- Seed script creates Travis's workspace with 4 streams

**CI:**
- GitHub Actions runs Supabase locally
- E2E tests against local instance
- No secrets required for PR builds

**Production (Travis's approval required):**
- Supabase free tier project
- Custom domain: `bureau.highstreet.market`
- Email sender: Resend or Supabase native

---

## 2. Database Schema

### Core Tables

**`workspaces`**
- `id` (uuid, primary key)
- `name` (text)
- `created_at` (timestamptz)
- `created_by` (uuid, references auth.users)

**`workspace_members`**
- `workspace_id` (uuid, references workspaces)
- `user_id` (uuid, references auth.users)
- `role` (enum: owner, member)
- `invited_at` (timestamptz)
- `joined_at` (timestamptz)

**`streams`**
- `id` (uuid, primary key)
- `workspace_id` (uuid, references workspaces)
- `name` (text)
- `category` (enum: audience, production, content-distribution, project, day-job, contract)
- `description` (text)
- `connected` (boolean)
- `data_source` (text)
- `last_updated` (timestamptz)
- `visible` (boolean)
- `created_at` (timestamptz)

**`metric_values`**
- `id` (uuid, primary key)
- `stream_id` (uuid, references streams)
- `metric_id` (text)
- `value` (numeric)
- `timestamp` (timestamptz)
- `source` (text)

**`connections`**
- `id` (uuid, primary key)
- `workspace_id` (uuid, references workspaces)
- `provider` (text)
- `method` (text)
- `status` (text)
- `credential_encrypted` (text)
- `scopes` (text[])
- `connected_at` (timestamptz)
- `last_sync_at` (timestamptz)

**`ingest_tokens`**
- `id` (uuid, primary key)
- `workspace_id` (uuid, references workspaces)
- `token` (text, unique)
- `name` (text)
- `created_at` (timestamptz)
- `revoked_at` (timestamptz)
- `last_used_at` (timestamptz)

**`ingest_log`**
- `id` (uuid, primary key)
- `workspace_id` (uuid, references workspaces)
- `token_id` (uuid, references ingest_tokens)
- `payload` (jsonb)
- `status` (enum: pending, approved, rejected)
- `created_at` (timestamptz)

**`pilot_invites`**
- `code` (text, primary key)
- `email` (text)
- `claimed_by` (uuid, references auth.users)
- `claimed_at` (timestamptz)
- `created_at` (timestamptz)

**`weekly_reviews`**
- `id` (uuid, primary key)
- `workspace_id` (uuid, references workspaces)
- `stream_id` (uuid, references streams)
- `objective` (text)
- `constraint` (text)
- `moves` (jsonb) -- array of {title, reasoning, prediction}
- `chosen_move` (integer)
- `chosen_at` (timestamptz)
- `created_at` (timestamptz)

### Row-Level Security (RLS)

Every table with `workspace_id` enforces:

```sql
-- Users can only read/write their own workspaces
CREATE POLICY workspace_isolation ON streams
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members 
    WHERE user_id = auth.uid()
  ));
```

**Tests MUST prove:**
- User A cannot read User B's streams
- User A cannot write to User B's workspace
- Member can read, only owner can delete workspace

---

## 3. Agent Ingest API

### Endpoint: `POST /api/ingest`

**Authentication:** Bearer token (workspace-scoped)

**Request:**
```json
{
  "stream_id": "duckduckgoose",
  "metrics": [
    {
      "id": "commits-30d",
      "value": 296,
      "timestamp": "2026-11-21T20:24:00-08:00",
      "source": "GitHub API"
    }
  ],
  "costs": [
    {
      "source": "ElevenLabs",
      "amount_usd": 1.25,
      "units": 125000,
      "unit_type": "tokens",
      "period_start": "2026-11-01",
      "period_end": "2026-11-21"
    }
  ],
  "decisions": [
    {
      "recommendation": "Push: Double content output",
      "reasoning": "Engagement up 15%, cost per view down 20%",
      "signal": "push"
    }
  ]
}
```

**Response:**
```json
{
  "status": "pending_review",
  "ingest_id": "ing_abc123",
  "message": "Data received. Review required before appearing in Bureau."
}
```

**Flow:**
1. Agent posts data with token
2. Bureau saves to `ingest_log` with status `pending`
3. User sees intake review modal (like existing IntakeReviewModal)
4. Approve ✓ → data appears in stream
5. Reject ✗ → logged but not shown

**Token Management:**
- Generated on `/connections` page
- Shown once: `bur_live_a1b2c3d4e5f6...`
- Revokable
- Last used timestamp

### Agent Integration Snippet

**File: `BUREAU.md`** (user copies into their agent instructions)

```markdown
# Bureau Integration

You are connected to Bureau, a command center for tracking your performance.

When you complete tasks, report metrics to Bureau:

**Endpoint:** POST https://bureau.highstreet.market/api/ingest
**Token:** bur_live_YOUR_TOKEN_HERE

**What to report:**
- Metrics: quantitative results (commits, followers, views, revenue)
- Costs: what you spent (API calls, credits, $)
- Decisions: what you recommend (push, keep, pause, kill) with reasoning

**Example:**
```json
{
  "stream_id": "my-project",
  "metrics": [{"id": "tasks-completed", "value": 5, "source": "Task log"}],
  "costs": [{"source": "OpenAI", "amount_usd": 0.50, "units": 10000, "unit_type": "tokens"}]
}
```

Bureau will review and show this data in the Top Floor dashboard.
```

---

## 4. OAuth Scaffolds (Disabled Until Env Vars)

### Providers

| Provider | Method | Scopes | Paid? | Notes |
|----------|--------|--------|-------|-------|
| **GitHub** | OAuth | `read:user`, `repo` (read) | ❌ Free | Full access to public/private repos |
| **X (Twitter)** | OAuth 2.0 | Read tweets, followers | ⚠️ **PAID** | Requires Basic tier ($100/mo) |
| **Google** | OAuth | YouTube Analytics (read) | ❌ Free | OAuth quota limits |
| **Stripe** | OAuth | Read charges, customers | ❌ Free | Restricted key preferred |

### Implementation

**Routes:**
- `/api/auth/[provider]/authorize` — Redirect to provider
- `/api/auth/[provider]/callback` — Handle OAuth callback
- Store encrypted tokens in `connections.credential_encrypted`

**Encryption:** AES-256-GCM with workspace-specific key derived from master secret

**Env Vars Required (Travis must provide):**
```env
# OAuth Client IDs
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
X_CLIENT_ID=  # Paid tier required
X_CLIENT_SECRET=
STRIPE_CLIENT_ID=
STRIPE_CLIENT_SECRET=

# Master encryption key
BUREAU_MASTER_KEY=  # 32 bytes, base64
```

**Default Behavior:** If env vars missing, OAuth buttons show "Not configured" disabled state.

### API Key Validation

**OpenAI:**
- POST to `/v1/models` with API key
- Success → valid read-only or admin key
- 401 → invalid

**ElevenLabs:**
- GET `/v1/user` with API key
- Returns usage + subscription

**Higgsfield:**
- Validate with account endpoint (TBD: check docs)

---

## 5. Onboarding P0: First Finding in 15 Minutes

**Clock starts:** Account creation  
**Goal:** User sees their first actionable finding within 15 minutes

### Flow

**Step 1: Sign Up (2 min)**
- Email magic link or Google OAuth
- Invite code required (pilot gate)
- Workspace created automatically: "{firstname}'s Workspace"

**Step 2: Create First Stream (3 min)**
- Prompt: "What are you building?"
- Quick-add: Select category (Audience, Production, Content, Project, Day Job, Contract)
- Name + description
- Stream created

**Step 3: Connect Data (5 min)**
- Three paths:
  1. **Agent ingest:** Show token + BUREAU.md snippet → "Copy to your agent"
  2. **OAuth:** GitHub/YouTube/etc. (if configured)
  3. **Manual entry:** Paste last 7 days of key metrics

**Step 4: First Finding (5 min)**
- If agent ingest: Shows intake review modal immediately when data arrives
- If OAuth: Syncs data, shows first metric cards
- If manual: Processes entries, shows metric cards
- **Finding:** "Based on [metric], here's what Bureau sees: [insight]"
  - Example: "Your follower growth is -0.33%. Consider reviewing your content strategy."

**Measurement:**
- Track `time_to_first_finding` per user
- Stored in `workspace_onboarding` table
- Admin view shows distribution

---

## 6. Weekly Review Flow

**Trigger:** Every Friday at 4pm PT (or manual)

### Structure

1. **Objective:** "What are you optimizing for this week?"
   - User input or auto-suggested: "Maximize engagement", "Minimize costs", "Hit revenue target"

2. **Constraint:** "What's your main constraint?"
   - Time budget: "10 hours available"
   - Cost cap: "$100 AI spend limit"
   - Focus: "Only one stream this week"

3. **Two Feasible Moves:**
   - Bureau proposes 2 actions:
     - **Move A:** "Push: 2x content output" — "Your cost/view is down 20%, engagement up 15%"
     - **Move B:** "Keep current pace" — "Avoid burnout, maintain 5% growth"
   - Each with:
     - Signal (push, keep, pause)
     - Reasoning (why Bureau recommends it)
     - Prediction (what will happen)

4. **Record Choice:**
   - User picks Move A, B, or "Something else" (custom)
   - Stored in `weekly_reviews.chosen_move`
   - Recorded at timestamp

5. **Next Review:**
   - 7 days later, Bureau reopens
   - Shows: "Last week you chose [X]. Here's what actually happened: [outcome]"
   - Prediction accuracy tracked

**Data:**
```json
{
  "objective": "Maximize engagement",
  "constraint": "10 hours available",
  "moves": [
    {
      "title": "Push: 2x content output",
      "signal": "push",
      "reasoning": "Cost/view down 20%, engagement up 15%",
      "prediction": "+30% impressions, +2h time"
    },
    {
      "title": "Keep current pace",
      "signal": "keep",
      "reasoning": "Avoid burnout, sustainable growth",
      "prediction": "+5% impressions, same time"
    }
  ],
  "chosen_move": 0,
  "chosen_at": "2026-11-22T16:00:00-08:00"
}
```

---

## 7. Pilot Ops: Admin View

**Route:** `/admin` (accessible only to Travis or designated admins)

### Dashboard

**Invites:**
- Total codes issued: 10
- Claimed: 5
- Pending: 5
- Generate new codes

**Active Workspaces:**
- Total: 5
- With data: 4 (80%)
- Empty: 1 (20%)

**Review Completion:**
- Users with ≥1 review: 3/5 (60%)
- Avg time to first finding: 12 minutes
- Weekly review completion rate: 2/3 (67%)

**Coverage (Connections):**
- GitHub: 2 workspaces
- Agent ingest: 4 workspaces
- Manual only: 1 workspace

**Product Analytics (In-DB):**
```sql
CREATE TABLE analytics_events (
  id uuid PRIMARY KEY,
  workspace_id uuid,
  event_name text,
  properties jsonb,
  created_at timestamptz
);
```

**Events tracked:**
- `signup_completed`
- `stream_created`
- `connection_added`
- `intake_approved`
- `weekly_review_completed`
- `feedback_submitted`

**Admin actions:**
- Generate invite code
- View workspace details
- Download data export (CSV)

---

## 8. Feedback Button

**Location:** Bottom-right corner, all pages

**Flow:**
1. Click "Feedback" button
2. Modal: "What's on your mind?"
   - Type: Bug, Feature Request, General
   - Message (required)
   - Screenshot (optional)
3. Submit → saved to `feedback` table
4. Admin view shows all feedback

**Data:**
```sql
CREATE TABLE feedback (
  id uuid PRIMARY KEY,
  workspace_id uuid,
  user_id uuid,
  type text,
  message text,
  screenshot_url text,
  page text,  -- current URL
  created_at timestamptz
);
```

---

## 9. Error Logging

**Sentry-like but in-DB** (no paid service)

```sql
CREATE TABLE error_logs (
  id uuid PRIMARY KEY,
  workspace_id uuid,
  user_id uuid,
  error_type text,
  message text,
  stack_trace text,
  url text,
  user_agent text,
  created_at timestamptz
);
```

**Client-side:**
```typescript
window.addEventListener('error', (event) => {
  fetch('/api/log-error', {
    method: 'POST',
    body: JSON.stringify({
      message: event.message,
      stack: event.error?.stack,
      url: window.location.href
    })
  });
});
```

**Admin view:** Shows errors grouped by type, with counts

---

## 10. E2E Tests (Playwright)

### Test Suites

**`tests/e2e/auth.spec.ts`**
- Sign up with email magic link
- Sign up with Google OAuth (mocked)
- Logout
- Account deletion

**`tests/e2e/workspace-isolation.spec.ts`**
- **Critical:** User A cannot read User B's data
- Create workspace as User A
- Try to access User B's stream URL → 403 or redirect
- Database query returns empty for User B's workspace_id

**`tests/e2e/ingest.spec.ts`**
- Generate ingest token
- POST to /api/ingest with token
- See intake review modal
- Approve → data appears in stream
- Revoke token → 401 on next POST

**`tests/e2e/intake-approve.spec.ts`**
- Ingest data as agent
- User sees pending intake
- Approve ✓ → metric cards populate
- Reject ✗ → not shown

**`tests/e2e/weekly-review.spec.ts`**
- Trigger weekly review
- Set objective + constraint
- See 2 proposed moves
- Choose one → recorded
- Next review shows "Last week you chose..."

**`tests/e2e/onboarding.spec.ts`**
- Sign up
- Create first stream
- Connect via manual entry
- See first finding
- Measure time_to_first_finding < 15 min

**`tests/e2e/admin.spec.ts`**
- Login as admin
- View dashboard
- Generate invite code
- Download workspace export

### CI Integration

**`.github/workflows/test.yml`**
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: supabase/setup-cli@v1
      - run: supabase start
      - run: npm install
      - run: npm run db:migrate
      - run: npm run db:seed
      - run: npx playwright install
      - run: npm run test:e2e
```

---

## 11. What Travis Must Approve

See **`docs/SETUP.md`** for detailed setup instructions.

### Required Approvals

**Hosting:**
- [ ] Vercel free tier (recommended) OR
- [ ] DigitalOcean App Platform ($5/mo) OR
- [ ] Self-hosted VPS

**Database:**
- [ ] Supabase free tier (recommended, 500MB) OR
- [ ] DigitalOcean Managed Postgres ($15/mo) OR
- [ ] Self-hosted Postgres

**Domain:**
- [ ] `bureau.highstreet.market` DNS pointing to host
- [ ] SSL certificate (auto via Vercel/DO)

**Email Sender:**
- [ ] Resend free tier (3,000 emails/mo) OR
- [ ] Supabase email (100 emails/hour) OR
- [ ] AWS SES ($0.10/1000)

**OAuth Clients (if enabling):**
- [ ] GitHub OAuth app (free)
- [ ] Google Cloud OAuth (free, quota limits)
- [ ] X API Basic tier ⚠️ **$100/mo**
- [ ] Stripe OAuth (free)

**Costs Summary:**
- **Minimum:** $0/mo (Supabase + Vercel + Resend free tiers)
- **Comfortable:** $20/mo (DO database + hosting)
- **With X API:** $120/mo (adds X Basic tier)

---

## 12. Implementation Status

### ✅ Complete
- Connection architecture with mock data
- Real stream metrics with sources
- Timezone handling (America/Los_Angeles)
- Build system passing

### 🚧 In Progress (This Phase)
- [ ] Supabase Auth setup
- [ ] Database migrations
- [ ] Workspace isolation with RLS tests
- [ ] Ingest API
- [ ] Token management UI
- [ ] Onboarding flow
- [ ] Weekly review UI
- [ ] Admin dashboard
- [ ] E2E tests
- [ ] Costs and Rules tabs for 4 streams

### 📋 TODO (Next Phase)
- [ ] OAuth integrations (after Travis approves clients)
- [ ] Sync jobs (cron)
- [ ] API key validation
- [ ] CSV import
- [ ] Email magic links (after sender approved)
- [ ] Deploy to staging

---

## 13. Local Development Setup

**Prerequisites:**
- Node.js 18+
- Docker
- Supabase CLI: `npm install -g supabase`

**Steps:**
```bash
# 1. Init Supabase locally
npx supabase init
npx supabase start  # Starts Postgres + Auth in Docker

# 2. Install dependencies
npm install

# 3. Run migrations
npm run db:migrate

# 4. Seed Travis's workspace
npm run db:seed

# 5. Start dev server
npm run dev

# 6. Run tests
npm run test:e2e
```

**Local URLs:**
- App: http://localhost:3000
- Supabase Studio: http://localhost:54323
- Postgres: postgresql://postgres:postgres@localhost:54322/postgres

---

## 14. Security Checklist

- [ ] RLS policies on all workspace tables
- [ ] E2E test proving workspace isolation
- [ ] Ingest tokens revokable
- [ ] OAuth credentials encrypted at rest (AES-256-GCM)
- [ ] Rate limiting on /api/ingest (100 req/min per token)
- [ ] CSRF protection on all forms
- [ ] XSS prevention (Next.js default)
- [ ] SQL injection prevention (Prisma parameterized queries)
- [ ] Invite codes have expiry (30 days)
- [ ] Account deletion cascades all data

---

## Next Steps

See **`docs/SETUP.md`** for step-by-step setup instructions after Travis approves hosting, database, and OAuth clients.
