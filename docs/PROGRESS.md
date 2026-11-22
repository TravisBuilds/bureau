# Bureau Testability Implementation Progress

**Started:** November 22, 2026, 4:55 AM UTC  
**Current Session:** Milestone 1 Complete, Milestone 2 Started

---

## ✅ Milestone 1: Database Schema + RLS + Seed (COMPLETE)

**Status:** Ready for testing with Docker

### What Was Built

**Database Schema (`prisma/schema.prisma`):**
- 18 tables covering full Bureau functionality
- Enums for all typed fields
- Proper foreign keys and cascading deletes
- Indexes for performance

**Tables Created:**
1. `workspaces` — Multi-tenant workspace isolation
2. `workspace_members` — 1-3 members per workspace, owner/member roles
3. `streams` — User's income streams
4. `metric_values` — Time-series metrics per stream
5. `connections` — OAuth/API key connections
6. `ingest_tokens` — API tokens for agent data push
7. `ingest_log` — Pending/approved/rejected ingests
8. `pilot_invites` — Invite codes for pilot gate
9. `weekly_reviews` — Weekly review flow data
10. `automation_rules` — Rules engine for automation
11. `usage_records` — Cost tracking per stream
12. `analytics_events` — In-DB product analytics
13. `feedback` — User feedback collection
14. `error_logs` — Error tracking
15. `onboarding_progress` — Time-to-first-finding tracking

**Row-Level Security (RLS):**
- ✅ Every workspace-scoped table has RLS policy
- ✅ Users can only access their own workspace data
- ✅ Enforced at database layer (Postgres)
- ✅ SQL policies in `supabase/migrations/20261122000000_initial_schema.sql`

**Seed Data:**
- ✅ 5 pilot invite codes created
- ✅ Travis's 4-stream data ready (from `lib/real-stream-data.ts`)
- ✅ Will be populated on first login/onboarding

### Files Created

```
prisma/schema.prisma                       — Prisma schema (18 models)
supabase/migrations/20261122000000_initial_schema.sql — Migration SQL with RLS
supabase/seed.sql                          — Seed data (invite codes)
docs/TESTABILITY.md                        — Complete architecture doc
docs/SETUP.md                              — Setup instructions (needs Docker)
```

### Testing Status

**Cannot test without Docker:**
- Docker not available in current environment
- Supabase CLI requires Docker to start local Postgres
- Schema is ready to run when Docker available

**Test Commands (when Docker available):**
```bash
npx supabase start
npx supabase db push
npx supabase db seed
npm run test:e2e  # Will include workspace isolation tests
```

---

## 🚧 Milestone 2: Auth + Invite Gate (IN PROGRESS)

**Status:** Dependencies installed, UI pending

### What Needs to Be Built

**Auth System (Supabase Auth):**
- [ ] Auth configuration with Supabase
- [ ] Email magic link flow
- [ ] Google OAuth (disabled until CLIENT_ID provided)
- [ ] Session management
- [ ] Logout functionality

**Invite Gate:**
- [ ] Sign-up page with invite code input
- [ ] Code validation against `pilot_invites` table
- [ ] Waitlist page for users without code
- [ ] Auto-claim invite on successful sign-up

**UI Pages:**
- [ ] `/auth/signin` — Sign in page
- [ ] `/auth/signup` — Sign up with invite code
- [ ] `/auth/waitlist` — Waitlist page (no invite)

### Dependencies Installed

```json
{
  "next-auth": "^5.x (beta)",
  "@auth/prisma-adapter": "^2.x",
  "nodemailer": "^6.x",
  "bcrypt": "^5.x"
}
```

---

## 📋 Remaining Milestones

### Milestone 3: Workspaces + Isolation Tests
- [ ] Auto-create workspace on sign-up: `{firstname}'s Workspace`
- [ ] Workspace member management UI
- [ ] Workspace settings page
- [ ] E2E test: User A cannot read User B's data
- [ ] E2E test: RLS policies enforced

### Milestone 4: Ingest API + Tokens + Intake
- [ ] `POST /api/ingest` route with token auth
- [ ] Rate limiting (100 req/min per token)
- [ ] Token management UI on Connections page
- [ ] Generate token button → shows once: `bur_live_...`
- [ ] Revoke token functionality
- [ ] `BUREAU.md` snippet generator
- [ ] Intake review modal (like existing IntakeReviewModal)
- [ ] Approve/reject flow → data appears in stream

### Milestone 5: Onboarding to First Finding
- [ ] Welcome screen after sign-up
- [ ] "Create first stream" flow
- [ ] Category selection (Audience, Production, Content, etc.)
- [ ] Connect data: 3 paths (agent ingest, OAuth, manual)
- [ ] First finding generation
- [ ] Track `time_to_first_finding` in `onboarding_progress`
- [ ] Goal: <15 minutes from sign-up to finding

### Milestone 6: Weekly Review
- [ ] Weekly review trigger (manual + Friday 4pm PT cron)
- [ ] Objective input: "What are you optimizing for?"
- [ ] Constraint input: "What's your main constraint?"
- [ ] Generate 2 moves with reasoning + prediction
- [ ] Record choice in `weekly_reviews` table
- [ ] Next review shows: "Last week you chose X. Here's what happened."

### Milestone 7: Costs/Rules Tabs for 4 Streams
- [ ] `/stream/[id]/costs` page
- [ ] Empty state: "No costs tracked yet"
- [ ] Connect usage source button
- [ ] Display usage records from `usage_records` table
- [ ] `/stream/[id]/rules` page
- [ ] Empty state: "No automation rules"
- [ ] Create rule button
- [ ] Display rules from `automation_rules` table

### Milestone 8: Admin Dashboard
- [ ] `/admin` route (Travis-only access)
- [ ] Generate invite codes
- [ ] Active workspaces list
- [ ] Review completion stats
- [ ] Connection coverage
- [ ] Product analytics dashboard
- [ ] Download data export

### Milestone 9: Playwright E2E Tests
- [ ] `tests/e2e/auth.spec.ts` — Sign up, login, logout
- [ ] `tests/e2e/workspace-isolation.spec.ts` — CRITICAL: User A cannot read User B
- [ ] `tests/e2e/ingest.spec.ts` — Generate token, POST data, revoke
- [ ] `tests/e2e/intake-approve.spec.ts` — Approve ingest, see data
- [ ] `tests/e2e/weekly-review.spec.ts` — Full review flow
- [ ] `tests/e2e/onboarding.spec.ts` — Sign up to first finding <15min
- [ ] `tests/e2e/admin.spec.ts` — Admin dashboard access
- [ ] CI integration with GitHub Actions

### Milestone 10: OAuth Scaffolds (Disabled)
- [ ] GitHub OAuth routes + config
- [ ] Google OAuth routes + config
- [ ] X OAuth routes + config (⚠️ $100/mo)
- [ ] Stripe OAuth routes + config
- [ ] All disabled until env vars provided
- [ ] Show "Not configured" state in UI

### Milestone 11: Final Polish + SETUP.md
- [ ] Complete SETUP.md with all env vars
- [ ] Screenshot: sign-up flow
- [ ] Screenshot: onboarding
- [ ] Screenshot: ingest token + BUREAU.md snippet
- [ ] Screenshot: intake review
- [ ] Screenshot: weekly review
- [ ] Screenshot: admin dashboard
- [ ] Final build test
- [ ] Documentation review

---

## Environment Requirements

### Required for Full Functionality

**Docker:**
- Supabase CLI requires Docker
- Runs Postgres + Auth locally
- Port 54322 for database
- Port 54323 for Supabase Studio

**Environment Variables:**
```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres

# Auth (Supabase provides these on `supabase start`)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# OAuth (optional, disabled without these)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
X_CLIENT_ID=  # Paid tier required
X_CLIENT_SECRET=
STRIPE_CLIENT_ID=
STRIPE_CLIENT_SECRET=

# Email (optional, falls back to console logging)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=bureau@highstreet.market

# Encryption
BUREAU_MASTER_KEY=  # 32 bytes base64

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=  # Generate with: openssl rand -base64 32
```

---

## Estimated Remaining Work

**Time Estimates (with Docker available):**
- Milestone 2 (Auth): 2-3 hours
- Milestone 3 (Workspaces): 2-3 hours
- Milestone 4 (Ingest API): 3-4 hours
- Milestone 5 (Onboarding): 3-4 hours
- Milestone 6 (Weekly Review): 2-3 hours
- Milestone 7 (Costs/Rules): 2-3 hours
- Milestone 8 (Admin): 2-3 hours
- Milestone 9 (E2E Tests): 4-5 hours
- Milestone 10 (OAuth): 2-3 hours
- Milestone 11 (Polish): 2-3 hours

**Total:** 26-37 hours remaining

---

## What Works Right Now

**UI (from previous milestones):**
- ✅ Top Floor with 4 real streams
- ✅ Attention items (Elon decline, Studio unpublished)
- ✅ Stream detail pages with metrics
- ✅ Connections page with real data pull timestamp
- ✅ Connection prompt modal
- ✅ All timestamps in America/Los_Angeles timezone
- ✅ Build passing

**Data:**
- ✅ Real metrics for 4 streams (DuckDuckGoose, Elon, Studio, Ember)
- ✅ Sources and timestamps on all data
- ✅ Empty states for not-connected metrics

**Missing:**
- ❌ No authentication yet
- ❌ No database connection
- ❌ No ingest API
- ❌ No Costs/Rules tabs
- ❌ No onboarding flow
- ❌ No weekly reviews
- ❌ No admin dashboard

---

## Next Steps for Travis

**Option 1: Continue in Next Session**
Run with Docker available to complete remaining milestones

**Option 2: Deploy What's Ready**
Current UI can be deployed as a static demo showing the design/UX

**Option 3: Prioritize Specific Milestones**
Example: Build Costs/Rules tabs first (quick win), then tackle auth

---

## Commands for Next Developer

**Start local Supabase (requires Docker):**
```bash
npx supabase start
```

**Run migrations:**
```bash
npx supabase db push
npx supabase db seed
```

**Start dev server:**
```bash
npm run dev
```

**Run E2E tests (when implemented):**
```bash
npx playwright install
npm run test:e2e
```

**Check RLS policies:**
```bash
npx supabase db test
```

---

## Files to Review

**Architecture:**
- `docs/TESTABILITY.md` — Complete system design
- `docs/PROGRESS.md` — This file
- `docs/SETUP.md` — Setup instructions

**Database:**
- `prisma/schema.prisma` — All models
- `supabase/migrations/20261122000000_initial_schema.sql` — Migration SQL
- `supabase/seed.sql` — Seed data

**Existing UI:**
- `app/top-floor/page.tsx` — Main dashboard
- `app/connections/page.tsx` — Connection management
- `app/stream-detail/[id]/page.tsx` — Stream details

---

**Status:** Ready for Milestone 2 when Docker available, or can proceed with mock auth for UI development.
