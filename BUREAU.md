# Bureau - Cost Tracking for AI Content Creators

**Cost your last video.** Track generation costs per output, not just per stream.

---

## What is Bureau?

Bureau helps AI content creators track the true cost of each piece they publish:
- **Output-first tracking**: Cost per video/episode, not just monthly spend
- **Trust levels**: Verified (API-sourced), Declared (manual), Estimated (formula)
- **Multi-platform**: Higgsfield, ElevenLabs, YouTube, X/Twitter
- **Workspace isolation**: 1-3 members per workspace with RLS security

---

## Key Features

### 1. Output Cost Tracking
Track exactly what each published piece cost to make:
- Generation costs (Higgsfield video, ElevenLabs voice)
- Native platform credits (HF credits, EL characters)
- Failed attempts (what didn't make the cut)
- Views and engagement metrics

**Example**: Ember Ep12
- Cost: $30.93 (Verified)
- Views: 49
- Cost per view: $0.63
- Breakdown: $8.13 stills, $22.75 clips, $0.05 VO (estimated)

### 2. Trust Levels
Every cost figure shows its trust level:
- **✓ Verified**: API-sourced (Higgsfield, ElevenLabs, YouTube)
- **◆ Declared**: Manually entered with source citation
- **~ Estimated**: Formula-based (e.g. ElevenLabs chars × rate)
- **Mixed**: "Verified · 1 estimated line" when output has both

### 3. Cost Transparency
Every total shows what it covers:
- 💡 "Higgsfield stills ($8.13) and clips ($22.75) plus estimated ElevenLabs VO ($0.05); 494 HF credits; failed attempts not recorded"
- Coverage notes explain exactly what's included and excluded
- No mystery numbers

### 4. Workspace Isolation
Multi-tenant with Row-Level Security (RLS):
- Each workspace sees only its own data
- 1-3 members per workspace
- Owner and member roles
- PostgreSQL RLS policies enforce isolation
- **5/5 isolation tests passing**

### 5. Output Lifecycle
Track outputs through their lifecycle:
- **Draft**: Work in progress, costs accumulating
- **Finished**: Ready to publish, final cost known
- **Published**: Live, tracking views
- **Abandoned**: Scrapped, costs recorded as sunk

---

## Pricing

### Free Tier
- 2 streams (e.g. "Ember", "Studio")
- Unlimited outputs per stream
- All trust levels (verified, declared, estimated)
- 1 workspace member
- Manual ingest (UI)

### Plus: $9/month or $79/year
- Unlimited streams
- API ingest tokens
- 3 workspace members
- Priority support
- Advanced allocation rules

---

## Quick Start

### 1. Sign Up
Pilot invites only. Visit `/auth/signin` and enter your email.

### 2. Onboarding: Cost Your Last Video
- Name your output (e.g. "Ember Episode 12")
- Choose data source:
  - **API Auto-Ingest**: Connect Higgsfield + ElevenLabs
  - **Manual Entry**: Upload ep12-manifest.json or enter costs
- Assign attempts to output
- Review cost card

### 3. Track More Outputs
- Each output gets its own cost breakdown
- Compare costs across outputs
- See which formats work best

### 4. Weekly Review
Rule-based decision support:
- Review last week's prediction vs actual
- Current objective and constraint
- 2 feasible moves with cost estimates
- Record your choice

---

## API Ingest

### Create Token
1. Go to `/settings/connect-agent`
2. Click "Create Token"
3. Copy the full token (shown once): `bureau_live_a1b2c3d4...`
4. After 30 seconds, only last 4 chars shown: `bureau_••••c3d4`

### Push Data
```bash
curl -X POST https://bureau.example.com/api/ingest \
  -H "Authorization: Bearer $BUREAU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "stream": "ember",
    "output": {
      "name": "Episode 13",
      "type": "short",
      "lifecycle": "published"
    },
    "charges": [
      {
        "description": "Higgsfield video generation",
        "costUsd": 25.00,
        "higgsfield_credits": 450,
        "trust": "verified",
        "source": "higgsfield-api"
      },
      {
        "description": "ElevenLabs voiceover",
        "costUsd": 0.08,
        "elevenlabs_characters": 850,
        "trust": "verified",
        "source": "elevenlabs-api"
      }
    ],
    "views": 0,
    "published_at": "2026-11-22T14:00:00Z"
  }'
```

### Response
```json
{
  "success": true,
  "output_id": "ep13",
  "total_cost_usd": 25.08,
  "charges_recorded": 2
}
```

---

## Architecture

### Tech Stack
- **Frontend**: Next.js 16, React 19, Tailwind CSS
- **Backend**: Next.js API Routes, Node.js
- **Database**: PostgreSQL with Row-Level Security (RLS)
- **Auth**: Supabase Auth (magic links)
- **Deployment**: Vercel (Hobby tier compatible)

### Database
- **Connection**: Split pools for security
  - App pool: `bureau_app` role (RLS enforced)
  - Admin pool: `postgres` role (migrations only)
- **Tables**: 18 tables with RLS policies
- **Migrations**: 5 migrations, skip `000001` in production (dev stubs)

### Security
- **RLS**: 5/5 isolation tests passing
- **Auth**: Magic link only (no passwords)
- **Tokens**: Masked after creation (`bureau_••••last4`)
- **Secrets**: 15 env vars, documented in `.env.example`

---

## Development

### Setup
```bash
# Clone
git clone https://github.com/TravisBuilds/bureau.git
cd bureau

# Install
npm install

# Configure
cp .env.example .env
# Edit .env: Set DATABASE_URL, SUPABASE_* vars

# Migrate
psql -f supabase/migrations/20261122000000_initial_schema.sql
psql -f supabase/migrations/20261122000001_auth_stubs.sql  # LOCAL ONLY
psql -f supabase/migrations/20261122000002_output_costs.sql
psql -f supabase/migrations/20261122000003_fix_rls_circular_dependency.sql
psql -f supabase/migrations/20261122000004_output_lifecycle.sql

# Seed (optional)
psql -f scripts/seed-pilot-data.sql
psql -f scripts/seed-travis-workspace.sql

# Run
npm run dev
# Visit http://localhost:3000
```

### Test
```bash
# Isolation tests (critical!)
npx tsx tests/isolation/run-isolation-tests.ts
# Must show: ✅ 5/5 tests passing

# E2E tests
npm run test:e2e
# Should show: ✅ 14/15 passing (1 skipped)

# Build verification
npm run build
```

---

## Deployment

See `docs/VERCEL-PREFLIGHT.md` for complete deployment guide.

### Quick Deploy
1. Create Vercel project (connect to GitHub)
2. Create Supabase project (free tier)
3. Configure 15 env vars from `.env.example`
4. Apply migrations (skip `000001`)
5. Deploy
6. Verify: Run isolation tests in production
7. Seed: Add pilot invites

### Environment Variables (15 required)
```bash
# Database
DATABASE_URL=postgresql://bureau_app:pass@host:5432/bureau
DATABASE_URL_ADMIN=postgresql://postgres:pass@host:5432/bureau

# Supabase Auth
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# NextAuth
NEXTAUTH_SECRET=xxx  # openssl rand -base64 32
NEXTAUTH_URL=https://bureau.vercel.app

# Bureau
BUREAU_MASTER_KEY=xxx  # openssl rand -base64 32
NODE_ENV=production

# Optional: API Connectors
ELEVENLABS_API_KEY=sk-...
HIGGSFIELD_API_KEY=hf-...
YOUTUBE_API_KEY=AIza...
# ... (see .env.example for all)
```

---

## Documentation

- `README.md` - This file
- `docs/VERCEL-PREFLIGHT.md` - Deployment guide
- `docs/DEPLOYMENT-READY-STATUS.md` - Current status
- `docs/WEEKLY-REVIEW.md` - Weekly review feature
- `docs/ADMIN-PAGE.md` - Admin interface
- `docs/MILESTONES-COMPLETE.md` - Development milestones
- `.env.example` - Environment variables

---

## Admin

### Workspace Management
Route: `/admin`

**Features**:
- **Members**: View, invite, remove (owner only)
- **Tokens**: View (masked), revoke (owner only)
- **Audit Log**: Track workspace activity

**Actions**:
- `auth.login` - User logged in
- `token.created` - Ingest token created
- `token.revoked` - Token revoked
- `output.created` - Data ingested
- `member.added` - Member invited
- `member.removed` - Member removed

---

## Weekly Review

Route: `/weekly-review`

**Rule-Based Decision Support** (no LLM, $0 cost):
1. Review last week's prediction vs actual outcome
2. Current objective and constraint
3. 2 feasible moves with cost estimates
4. Record your choice for next week

**LLM Mode**: Disabled by default
- Requires `BUREAU_ENABLE_LLM_REVIEW=true`
- Requires API key (Anthropic or OpenAI)
- Travis Wu approval required (no paid spend yet)
- Cost: ~$0.01-0.05 per review when enabled

---

## Roadmap

### Phase 1: Foundation ✅
- [x] Output-first cost tracking
- [x] Trust levels (verified, declared, estimated)
- [x] Workspace isolation (5/5 RLS tests)
- [x] Magic link authentication
- [x] API ingest tokens
- [x] Weekly review (rule-based)
- [x] Admin page
- [x] Playwright E2E tests

### Phase 2: Integration
- [ ] Higgsfield API connector (auto-ingest)
- [ ] ElevenLabs API connector (auto-ingest)
- [ ] YouTube Analytics integration (views)
- [ ] X/Twitter API integration (engagement)
- [ ] Webhook delivery for real-time ingest

### Phase 3: Advanced Features
- [ ] Allocation rules (auto-assign charges)
- [ ] Budget alerts (weekly spend warnings)
- [ ] Cost forecasting (predict next episode cost)
- [ ] Multi-currency support (USD, EUR, GBP)
- [ ] Export to CSV/Excel

### Phase 4: Collaboration
- [ ] Team workspaces (3+ members)
- [ ] Role-based permissions (read/write/admin)
- [ ] Shared views (public cost dashboards)
- [ ] Comments and annotations

---

## Support

### Issues
GitHub: [TravisBuilds/bureau/issues](https://github.com/TravisBuilds/bureau/issues)

### Questions
Email: travis@bureau.example.com

### Contributing
1. Fork the repo
2. Create a feature branch
3. Run tests: `npm run test:e2e` and `npx tsx tests/isolation/run-isolation-tests.ts`
4. Submit PR with passing tests

---

## License

MIT License - See LICENSE file

---

## Credits

Built with:
- Next.js 16
- React 19
- PostgreSQL with Row-Level Security
- Supabase Auth
- Tailwind CSS
- Playwright (testing)

**Last Updated**: November 22, 2026 6:50 AM UTC  
**Version**: 1.0.0  
**Status**: Deployment Ready ✅
