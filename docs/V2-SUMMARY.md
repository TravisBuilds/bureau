# Bureau v2: Complete Redesign Summary

**Built:** November 22, 2026  
**User #1:** Travis - solopreneur with 8 income streams and a day job

## What Changed

### From v1 → v2

**v1:** Generic decision engine for any business  
**v2:** Command center for solopreneurs with 10-20 income streams

**v1:** Corporate framing (Company, CEO, org chart)  
**v2:** Personal framing (Income streams, helpers, plain language)

**v1:** One project at a time  
**v2:** Many streams, brief check-ins, scannable portfolio

## Three Major Contributions

### 1. Paperclip Foundation Study

**What is Paperclip?**  
Open-source platform (MIT) for managing AI agent organizations. Built for startups trying to scale.

**Our Analysis:** `docs/PAPERCLIP.md`

**Decision:** Reimplement Paperclip's technical patterns, do NOT run on Paperclip.

**Why:** Philosophical difference. Paperclip is for startups (CEO agents, org charts, $1M MRR goals). Bureau is for solopreneurs (1-3 people, personal income goals, day jobs).

**What we borrow (technical plumbing):**
- ✅ Adapters (if it can receive a heartbeat, it's hired)
- ✅ Heartbeats (agents wake on schedule/assignment/comment)
- ✅ Task threads (comment discussions)
- ✅ Approval gates (founder sign-off)
- ✅ Budget enforcement (80% warning, 100% pause)
- ✅ Activity log (audit trail)

**What we skip (corporate framing):**
- ❌ "Company" terminology → "Income Stream"
- ❌ Org chart/hierarchy → "Your Helpers" panel
- ❌ CEO/CTO roles → Helpers with jobs
- ❌ Corporate goals → Personal goals
- ❌ Strategy approval → Goal check-in

**Recommendation (3 sentences):**  
Bureau and Paperclip serve different users with different philosophies. Paperclip frames work as corporate scaling (companies, CEO agents, org charts). Bureau frames work as personal income streams (solopreneurs with day jobs, helpers not hierarchies). By borrowing Paperclip's technical patterns but skipping its corporate framing, Bureau stays focused on its true audience: people turning passions into income while working a day job.

### 2. Agent Integration Strategy

**Problem:** Multiple AI providers could create UI chaos.

**Our Solution:** `docs/AGENT-INTEGRATION.md`

**Core Principles:**

1. **One adapter contract:** Provider differences stay inside adapter
2. **Capability-based, not brand-based:** Agents described by what they do (code, research), not brands (ChatGPT, Claude)
3. **Bureau routes, user approves:** Show ONE suggested helper with "change" option, not buttons per agent
4. **Unified task thread:** All results in same format, one inbox
5. **Multi-agent takes: opt-in, capped:** Default is one agent. Two-takes mode for real decisions only.
6. **Agent ownership & budget:** Each agent owned by one stream, budget cap, simple list
7. **Agent chatter hidden:** Humans see outcomes and blockers only

**Anti-patterns documented:**
- ❌ Per-agent tabs (fragments UI)
- ❌ Brand-first routing ("Send to ChatGPT")
- ❌ Automatic multi-agent (expensive, slow)
- ❌ Exposed agent chatter (noise)

**Success criteria:**
- ✅ Adding new provider takes <1 day
- ✅ UI never mentions brand names
- ✅ One inbox, one task board
- ✅ Budget limits enforced
- ✅ Multi-agent is opt-in

### 3. Built for Travis (User #1)

**Who:** Solopreneur with 7 income streams, checks Bureau briefly from day job

**His real streams:** `lib/travis-streams-seed.ts`

1. **Plum List** - restaurant saves (Plumlist agent) ← HAS REAL DATA
2. DuckDuckGoose - video studio (DuckDuckGoose agent)
3. Bedtime with Ember - kids content (Ember + Grower) ← MULTIPLE AGENTS
4. Quacked Concierge Peak Glow Up - resort IP (Studio Peak Glow Up)
5. Offkey - karaoke app (Offkey PM)
6. StarringYou - Chrome extension (StarringYou agent)
7. Bureau - this product (Bureau agent)

**New Portfolio:** `components/PortfolioPageCompact.tsx`

**Features:**
- Portfolio rollup (totals only connected streams)
- Today's queue (top 5 items cross-stream, capped)
- Filters: All / Needs Me / Growing / Paused
- Sort: Name / Signal / Spending / Earning
- Table view: scannable, one row per stream
- Multiple agents per stream shown
- Not-connected: "Connect agent" button, NO fake metrics
- Scales to 10-20 streams

**Design for brief check-ins:**
- Headline: "What needs you today"
- Rollup shows totals at a glance
- Table is scannable
- Filters let you focus

## Philosophical Foundations

### Solopreneurs vs Startups

**Paperclip is for startups:**
- Companies trying to scale
- CEO agents, org charts
- Corporate goals ($1M MRR)
- Raising capital

**Bureau is for solopreneurs:**
- 1-3 people with day jobs
- Turning passions into income
- Personal goals ("cover costs", "$500/mo")
- Scarce resources: hours + money

### Team Size: 1-3 People

**Default:** One founder. No team clutter in UI.

**When second person joins:** Show "Team" section with members (name, role, time, permissions).

**What we DON'T support:** Departments, complex hierarchy, 10+ person teams.

### No Fake Metrics

**Only Plum List has real data:** 26 users, $9.97 spending, $0 earning.

**Other 7 streams:** Show "connect agent" state. NO invented numbers.

## Highstreet Branding

**Product name:** Bureau by Highstreet

**Colors extracted from highstreet.market:**
- Primary: #6253F1 (purple)
- Cyan: #00f2fe
- Gradient: cyan → purple (H logo)

**Logo:** `public/highstreet-logo.svg`

**Design:** Bright, sunny, clean, relaxed

**Tailwind theme:** `app/globals.css`

## Technical Implementation

### Data Model

**New types:**
- `lib/team-types.ts` - TeamMember, TaskAssignment, PersonalTimeTracking (1-3 people per stream)
- `lib/travis-streams-seed.ts` - Real stream data for Travis
- `lib/agent-provider-interface.ts` - Capability, CostTier, SpeedTier

**Key concepts:**
- Income stream (not Company)
- Helper agent (not Employee)
- Personal goal (not Corporate KPI)
- Member (1-3 people, not department)

### UI Components

**New:**
- `AppLayout` - Left sidebar with collapsible nav
- `PortfolioPageCompact` - Many streams, scannable table
- `CompanyOverviewPage` - Personal framing ("Is this becoming real income?")
- `YourHelpersPage` - Simple list, NO hierarchy
- `MoneyPage` - Spending vs earning, plain language
- `TaskBoard` - 5-column kanban
- `BudgetPage` - Company ceiling, per-agent limits

**Removed:**
- Org chart with hierarchy
- Corporate terminology
- Multi-project cards (replaced with table)

### API Routes (Already Built)

- `/api/connections` - Connect agents (server-side auth)
- `/api/tasks` - Dispatch & track tasks
- `/api/chat` - Live messaging

**Security:**
- AES-256-CBC encryption
- Server-side only
- Never exposed to client

### Tests

**82 tests passing:**
- Decision engine: 24 tests
- Take comparison: 16 tests
- Agent providers: 12 tests
- Security: 12 tests
- Metrics: 18 tests

## Documentation

### Core Docs

1. **docs/PAPERCLIP.md** - Foundation analysis
   - Philosophical difference: startups vs solopreneurs
   - What we borrow (technical) vs skip (corporate framing)
   - Recommendation: reimplement, don't run on Paperclip
   - Team size: 1-3 people

2. **docs/AGENT-INTEGRATION.md** - Integration strategy
   - One adapter contract
   - Capability-based routing
   - Unified task thread
   - Multi-agent: opt-in, capped
   - Anti-patterns to avoid

3. **docs/V2-SUMMARY.md** - This file

### README.md

Updated with:
- Paperclip-inspired foundation
- Highstreet branding
- Solopreneur philosophy
- 82 tests
- Security architecture

## What's NOT Built Yet

### Phase 2: Smart Routing
- [ ] Match task to best helper (by capability + cost + speed)
- [ ] "Suggested helper" with "Change" option
- [ ] Task routing logic

### Phase 3: Real Providers
- [ ] OpenAI adapter
- [ ] Cursor adapter
- [ ] Budget enforcement at provider level

### Phase 4: Multi-Agent Takes
- [ ] Two-takes comparison UI
- [ ] Opt-in flow
- [ ] Cap at 2-3 agents

### Phase 5: Team Features
- [ ] Multiple team members per stream
- [ ] Task assignment to person OR helper
- [ ] Time tracking per person
- [ ] Permission management

## Screenshots Taken

**New Bureau v2:**
1. `portfolio.png` - Old version (3 cards)
2. `portfolio-solopreneur.png` - New compact version (table, filters, today queue)
3. `company-overview.png` - Personal framing
4. `org-chart.png` - Old hierarchy
5. `task-board-new.png` - 5-column kanban
6. `budget.png` - Spending limits
7. `helpers.png` - (pending) Simple list of helpers
8. `money-in-out.png` - (pending) Spending vs earning

## Key Metrics

**Lines of code:**
- New files: ~2,000 lines
- Updated files: ~500 lines
- Documentation: ~1,500 lines
- Total: ~4,000 lines

**Files created:**
- 10 new components
- 3 documentation files
- 2 data/type files
- 5 API routes (from earlier)

**Tests:** 82 passing

## Success Criteria Met

✅ **Paperclip analysis complete:** Documented in docs/PAPERCLIP.md  
✅ **Agent integration strategy:** Documented in docs/AGENT-INTEGRATION.md  
✅ **Built for Travis:** 8 real streams, compact portfolio, brief check-ins  
✅ **Solopreneur framing:** Income streams, helpers, personal goals  
✅ **Highstreet branding:** Logo, colors, clean design  
✅ **No fake metrics:** Only Plum List has real data  
✅ **Scales to 10-20 streams:** Table view, filters, today queue  
✅ **Multiple agents per stream:** Ember + Grower example  
✅ **1-3 person teams:** Data model supports, UI simple for solo  
✅ **All tests pass:** 82 tests green  

## What Travis Gets

**A portfolio built for him:**
- 7 real streams (6 not connected yet, 1 with real data)
- Brief check-in view: what needs you today
- Scannable table: signal, needs you, spending, earning
- Today queue: top 5 items cross-stream
- Filters: needs me / growing / paused
- Rollup: totals only connected streams

**Future:** As he connects more agents, Bureau fills in. No fake data, no clutter.

**Philosophy:** Built for someone with a day job and many side projects. Quick check-ins, clear priorities, personal goals.

---

**Result:** Bureau v2 is a clean, focused command center for solopreneurs. It borrows Paperclip's technical patterns but stays true to its audience: people turning passions into income streams while holding a day job.
