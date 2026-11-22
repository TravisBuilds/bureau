# Paperclip Foundation Analysis

**Date:** November 22, 2026  
**Purpose:** Evaluate whether Bureau should run ON Paperclip or reimplement its patterns

## Philosophical Difference: Startups vs Solopreneurs

**Paperclip is for startups.** It frames work as companies trying to scale: CEO agents, org charts, corporate goals like "$1M MRR", hiring teams.

**Bureau is for solopreneurs with day jobs.** People turning passions into income streams. The founder is the only person. Agents are helpers. The scarce resources are the founder's hours and money. Goals are personal: "cover my costs", "make $500/month side income", "learn if anyone wants this".

This philosophical difference shapes what we borrow from Paperclip and what we skip.

## Paperclip Core Concepts (What We Borrow)

### 1. Company
- Self-contained AI organization with one goal, team of agents, task board, and budget
- Monthly budget ceiling for the entire organization
- Complete isolation between companies (Plum List runs separately from other projects)
- **Bureau equivalent:** Each project = one Company

### 2. Agent (Role-Based)
- AI employee with specific job, manager, runtime/provider, and budget
- Organized in strict hierarchy (CEO reports to founder/board, all others report up)
- Each agent has monthly budget within company ceiling
- **Bureau equivalent:** Connected providers become agents with roles, founder is the board

### 3. Task (Work Unit)
- Ticket-style work with title, description, priority, status, assignee
- Lifecycle: backlog → todo → in_progress → in_review → done (or blocked/cancelled)
- Comment threads for progress updates
- **Bureau equivalent:** Dispatched tasks from "What to do next"

### 4. Heartbeat (Scheduled Execution)
- Agents don't run continuously — they wake on schedule/assignment/comment
- Each heartbeat logged with full transcript
- Triggers: schedule, task assignment, comment, manual invoke, approval resolution
- **Bureau equivalent:** Dispatch triggers heartbeat; task status = execution window

### 5. Budget (Spending Cap)
- Company-level ceiling + per-agent limits
- 80% warning, 100% = auto-pause
- Prevents runaway costs
- **Bureau equivalent:** Monthly budget ceiling per company, per-agent limits, cost tracking

### 6. Approval (Governance Gate)
- Strategy approval: CEO's first plan needs board sign-off
- Hire agent approval: Manager requests new agent, board reviews
- Budget override approval: when hard stop hit
- **Bureau equivalent:** "Needs Founder" queue for approvals

### 7. Adapter (Runtime Connection)
- Paperclip is orchestration, not the AI itself
- Adapters: claude_local, codex_local, cursor, http, etc.
- "If it can receive a heartbeat, it's hired"
- **Bureau equivalent:** AgentProvider interface = adapter

## Paperclip's Full Stack

**What Paperclip provides:**
- Multi-company isolation
- Agent hierarchy (org chart)
- Task board with lifecycle
- Budget tracking + enforcement
- Approval queue
- Activity/audit log
- Heartbeat scheduling
- Adapter interface (Claude, Codex, Cursor, webhooks)
- Dashboard UI for all of the above

**What Paperclip does NOT provide:**
- Business-health intelligence
- Decision derivation (is this a viable business?)
- Pricing recommendations
- Keep/push/pause/kill signals
- Break-even calculations
- Multi-agent take comparison
- Deterministic decision logic

## Should Bureau Run ON Paperclip?

### Option A: Bureau as a Layer ON Paperclip

**How it would work:**
- Paperclip handles: company isolation, agents, tasks, budgets, approvals, heartbeats
- Bureau adds: decision brain via API calls to Paperclip's data
- Bureau becomes a "decision layer" that queries Paperclip's task/budget/agent state
- Bureau's UI shows Paperclip data + derived decisions

**Pros:**
- Don't reimplement company/agent/task infrastructure
- Leverage Paperclip's mature adapter ecosystem
- Bureau focuses ONLY on decision logic (its differentiator)
- Users can run Paperclip agents + Bureau decisions together

**Cons:**
- Requires Paperclip installation + running (adds deployment complexity)
- Bureau tied to Paperclip's data model (harder to pivot)
- Paperclip is early/evolving (breaking changes risk)
- Two services to run, two auth layers, two databases
- Bureau's core value (decision brain) hidden behind Paperclip UI

### Option B: Reimplement Paperclip Patterns

**How it would work:**
- Bureau adopts Paperclip's concepts (Company, Agent hierarchy, Tasks, Budgets, Approvals)
- Bureau implements its own version of these ideas
- Bureau's decision brain sits at the core, not as an add-on

**Pros:**
- Single codebase, single deployment
- Bureau's decision brain prominent (not hidden)
- Full control over data model + UI
- No external dependencies
- Can simplify: Bureau doesn't need all of Paperclip's features (e.g. complex scheduling)
- Easier for founders with day jobs (one app, not two)

**Cons:**
- Must build company/agent/task infrastructure
- Must maintain adapter interface (but already have AgentProvider)
- More code to write/maintain

## Recommendation

**Reimplement Paperclip's technical plumbing. Do NOT run on Paperclip.**

### Reasoning

Bureau and Paperclip serve different users with different philosophies. Paperclip frames work as **corporate scaling** (companies, CEO agents, org charts, $1M MRR goals). Bureau frames work as **personal income streams** (solopreneurs with day jobs, helpers not hierarchies, "cover my costs" not "raise Series A"). Running Bureau ON Paperclip would force solopreneurs into corporate terminology and workflows that don't fit their reality. By borrowing Paperclip's **technical patterns** (adapters, heartbeats, task threads, budget enforcement) but **skipping its corporate framing**, Bureau stays focused on its true audience: people turning passions into income streams while working a day job.

### What Bureau Borrows from Paperclip (Technical Plumbing)

**Technical Infrastructure:**
1. ✅ Adapter interface ("if it can receive a heartbeat, it's hired")
2. ✅ Heartbeat concept (agents wake on schedule/assignment/comment)
3. ✅ Task threads (comment discussions on work)
4. ✅ Approval gates (founder sign-off on important decisions)
5. ✅ Budget enforcement (80% warning, 100% auto-pause)
6. ✅ Activity log (audit trail of all actions)
7. ✅ Task lifecycle (backlog → todo → in_progress → review → done)

**What Bureau Skips (Corporate Framing):**
- ❌ "Company" terminology → Use "Income Stream" or "Passion Project"
- ❌ Org chart / hierarchy → Simple "Your Helpers" panel
- ❌ CEO/CTO roles → Agents are assistants with jobs, not corporate titles
- ❌ "Hire agent" flow → "Connect a helper"
- ❌ Corporate goals ($1M MRR) → Personal goals ("cover costs", "$500/mo side income")
- ❌ Strategy approval → Goal check-in ("Is this still what you want?")
- ❌ Agent reports to manager → All helpers report to founder (no middle management)

### What Bureau ADDS Beyond Paperclip

**Bureau's Differentiator:**
1. **Decision Brain**: Deterministic engine that evaluates business viability
2. **Keep/Push/Pause/Kill Signals**: Clear founder guidance per project
3. **Multi-Agent Takes**: Different agents provide recommendations, Bureau breaks ties
4. **Break-Even Analysis**: Cost per user, pricing recommendations
5. **Business-Health Intelligence**: Track metrics over time, understand what's working
6. **Priority Ranking**: Across all projects, what needs attention NOW
7. **Founder-Time Budget**: Weekly hours available vs asks across portfolio

## Implementation Plan

### Phase 1: Paperclip-Inspired Foundation (This iteration)
- [x] Rename "Project" → "Company" (each with one goal)
- [x] Add monthly budget ceiling per company
- [x] Build org chart view (agents in hierarchy, founder at top)
- [x] Enhance task board with full lifecycle
- [x] Add approval queue ("Needs Founder")
- [x] Add budget dashboard (spend vs ceiling)
- [x] Add activity log

### Phase 2: Polish
- [ ] Agent roles (CEO, Engineer, Researcher)
- [ ] Per-agent budget limits
- [ ] Task threads (comment discussions)
- [ ] Budget alerts (80% warning, 100% pause)

### Phase 3: Advanced
- [ ] Multi-company isolation in DB
- [ ] Historical tracking (business health over time)
- [ ] Custom agent workflows

---

**Conclusion:** Bureau reimplements Paperclip's proven patterns while keeping its decision brain front-and-center. This is the foundation for a command center that solo founders with day jobs actually use.
