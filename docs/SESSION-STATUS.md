# Bureau - Session Status (Nov 22, 2026 5:30 AM)

**Latest commit:** bc259f3 "Add output_costs table + auth flow"

---

## ✅ COMPLETE (Milestones 1-2 Partial)

### 1. Database Foundation (100%)
- ✅ Postgres installed and running locally
- ✅ 19 tables with RLS policies
- ✅ Auth stubs (`auth.users`, `auth.sessions`, `auth.uid()`)
- ✅ **NEW:** `output_costs` table for cost-per-output P&L
- ✅ Migrations applied cleanly
- ✅ Connection: `postgresql://postgres@localhost:5432/bureau`

### 2. Pricing Model (100%)
- ✅ Updated to **$9/mo Plus** ($79/yr annual option)
- ✅ **Free tier:** 2 streams, manual/CSV, cost ledger
- ✅ **Plus tier:** unlimited streams, API connectors, automation
- ✅ LLM costs explicitly included ($0.054/user/mo)
- ✅ Gross margin: 85-99% at scale
- ✅ Cost-per-output P&L documented as lead wedge
- ✅ Unit economics in `docs/UNIT-ECONOMICS.md`

### 3. Auth Flow (90%)
- ✅ Sign-up page with invite code validation
- ✅ Sign-in page with error handling
- ✅ Magic link generation (console logging in dev)
- ✅ Token verification + session creation
- ✅ Auto workspace creation on first login
- ✅ Onboarding tracking
- ✅ API routes: `/api/auth/validate-invite`, `/api/auth/send-magic-link`
- ✅ Auth verify route: `/auth/verify?token=...`
- ✅ Lazy database connection (no pool during build)
- ✅ Build passing ✓

### 4. UI Foundation (100%)
- ✅ Top Floor with 4 real streams
- ✅ Connection management page
- ✅ Stream detail pages
- ✅ Timezone fix (America/Los_Angeles)
- ✅ Real data timestamps (Nov 21, 8:24 PM PT)

### 5. Documentation (100%)
- ✅ TESTABILITY.md (complete architecture)
- ✅ UNIT-ECONOMICS.md ($9/mo pricing, margins, scale)
- ✅ NEXT-SESSION.md (build plan with code examples)
- ✅ PROGRESS.md (original roadmap)
- ✅ SESSION-COMPLETE.md → SESSION-STATUS.md (this file)

---

## 🚧 IN PROGRESS / NEXT STEPS

### Priority 1: Seed Data & Testing
- [ ] **Seed pilot invite codes** (BUREAU_PILOT_001)
- [ ] **Test auth flow end-to-end**
  - Visit /auth/signup → enter email + invite → magic link in console → click → workspace created → redirect to /top-floor
- [ ] **Verify RLS isolation** (manual SQL tests)

### Priority 2: Costs Tab (Lead Wedge)
- [ ] **Empty state UI** with 3 options:
  - Connect API key (ElevenLabs, Higgsfield)
  - Import CSV
  - Enter manually
- [ ] **Data view** with outputs table:
  - Columns: Output name, Cost, Views, $/View, Trust badge
  - Summary cards: Total cost, Total views, Avg cost/view
- [ ] **API route:** `/api/streams/[id]/costs`
- [ ] **Sample data for Ember:**
  - Ep12 Short: $30.93, 49 views
  - "Too Many Trees": $30.93, 34 views
  - Trust: "declared" (manual entry)

### Priority 3: Rules Tab (Scaffold Only)
- [ ] **Empty state** similar to Costs tab
- [ ] Text: "Rules help you stay on track. Example: 'Publish 1 Short per week' or 'Keep cost per view under $0.50'"
- [ ] Defer automation to later milestone

### Priority 4: API Key Connectors
- [ ] **ElevenLabs connection form:**
  - API key input
  - Test connection button
  - Save to `connections` table
  - Fetch usage API → map to outputs
- [ ] **Higgsfield connection form:**
  - API key input
  - Fetch credits/spending → map to outputs
- [ ] **YouTube OAuth:**
  - Disabled until env vars (`GOOGLE_CLIENT_ID` etc)
  - Show "Contact admin to enable" message

### Priority 5: Onboarding Flow
- [ ] **Welcome screen:** "What's your first stream?"
- [ ] **Stream creation:** Name, category, description
- [ ] **Connection prompt:** "How do you want to track it?"
  - Connect API
  - Import CSV
  - Enter manually
- [ ] **First finding:** Manual or generated
- [ ] **Completion:** Redirect to /top-floor

### Priority 6: Weekly Review
- [ ] **Review page:** `/streams/[id]/review/[week]`
- [ ] **LLM-powered findings:** Claude 3.5 Haiku
- [ ] **Moves picker:** 3 options with reasoning
- [ ] **Chosen move tracking**

### Priority 7: Admin Dashboard
- [ ] **User list** (email, workspace, joined date)
- [ ] **Invite management** (create, revoke)
- [ ] **Usage stats** (streams per user, API calls)
- [ ] **Cost monitoring** (LLM usage, DB size)

### Priority 8: E2E Tests
- [ ] **Playwright setup**
- [ ] **Auth flow test** (signup → signin → verify)
- [ ] **Workspace isolation test** (RLS enforcement)
- [ ] **Stream creation test**
- [ ] **Cost entry test**

---

## 🔧 TECHNICAL NOTES

### Database
- **Prisma version mismatch:** CLI v8 → v7.10.1 to match client
- **No `npx prisma generate`:** Using direct `pg` Pool instead
- **Why:** Prisma 7+ changed schema format, easier to use raw SQL
- **Trade-off:** No type-safe queries, but simpler for pilot

### Auth
- **Local dev:** Magic links log to console
- **Production:** Will use Supabase Auth (adapter already abstracted)
- **Sessions:** Stored in `auth.sessions` table
- **RLS:** Uses `auth.uid()` function

### Cost Ledger
- **Trust levels:**
  - `verified`: API-sourced (ElevenLabs, Higgsfield, YouTube)
  - `declared`: Manually entered
  - `estimated`: Formula-based (future)
- **Failed renders:** Tracked in `failed_renders_cost_usd` column
- **Per-output:** Each episode/video/Short gets own row

### Build
- **Fixed:** Suspense boundary for `useSearchParams()`
- **Fixed:** Lazy Pool initialization (no DB during build)
- **Passing:** ✓ All pages prerender or marked dynamic

---

## 📝 COMMANDS FOR NEXT SESSION

```bash
# Start Postgres
sudo service postgresql start

# Start dev server
npm run dev

# Test auth flow
# 1. Go to http://localhost:3000/auth/signup
# 2. Enter email + BUREAU_PILOT_001
# 3. Check terminal for magic link
# 4. Click link → should redirect to /top-floor

# Apply new migrations (if any)
sudo -u postgres psql -d bureau -f supabase/migrations/[new-file].sql

# Test RLS
sudo -u postgres psql -d bureau
# SELECT auth.set_user('user-id-here'::uuid);
# SELECT * FROM streams;  -- should only see streams in that user's workspace

# Build
npm run build

# Type check
npm run type-check
```

---

## 📊 PROGRESS SUMMARY

| Milestone | Status | Complete |
|-----------|--------|----------|
| 1. Database + RLS | ✅ Done | 100% |
| 2. Pricing Model | ✅ Done | 100% |
| 3. Auth Flow | ✅ Done | 90% (needs seeding + testing) |
| 4. Cost Ledger Schema | ✅ Done | 100% |
| 5. Costs Tab UI | ⏳ Next | 0% |
| 6. Rules Tab UI | ⏳ Next | 0% |
| 7. API Connectors | ⏳ Next | 0% |
| 8. Onboarding | ⏳ Next | 0% |
| 9. Weekly Review | ⏳ Next | 0% |
| 10. Admin Dashboard | ⏳ Next | 0% |
| 11. E2E Tests | ⏳ Next | 0% |

**Overall:** ~35% complete (4/11 milestones done or mostly done)

---

## 🎯 IMMEDIATE NEXT ACTIONS

1. **Seed pilot invites:**
   ```sql
   INSERT INTO pilot_invites (code, expires_at)
   VALUES ('BUREAU_PILOT_001', '2027-01-01'::date);
   ```

2. **Test auth flow** (manual verification)

3. **Build Costs tab UI** with empty state

4. **Add sample cost data for Ember** (manual SQL)

5. **Commit + push** at each green milestone

6. **Screenshots** of:
   - Sign-up page
   - Magic link in console
   - Costs tab empty state
   - Costs tab with data
   - Trust badges

---

**Key insight:** Cost-per-output P&L is the lead wedge. Free tier gets cost ledger with manual/CSV entry. Plus tier ($9/mo) gets API automation. Focus: make Costs tab beautiful and useful ASAP. 🚀
