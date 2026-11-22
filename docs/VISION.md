# Bureau Vision

## The Big Picture

**Bureau is built for a future where someone has multiple income streams**, not just one job. The office building metaphor: the top floor is where the big brain sits, with a comprehensive dashboard of all the streams that fill the floors beneath it.

From the top floor, you see at a glance: income in (day job, contracts, projects), costs out (agent usage, APIs, subscriptions), net per stream and overall, time spent, trends, and what needs attention. The founder draws their own conclusions from the numbers.

## Three Income Stream Types

### Day Job
Your 9-5, the salary or hourly work that pays the bills today.

**Data tracked:**
- Employer and role
- Salary or hourly rate
- Pay frequency and hours per week
- Recent pay stubs (gross, net, period)
- Benefits

**Agent population:** Agent sends employer info, pay data, hours, recent stubs, benefits.

### Contract Work
Freelance clients, invoices, project-based income.

**Data tracked:**
- Active and inactive clients
- Hourly or project rates per client
- Recent invoices (amount, dates, status: draft/sent/paid/overdue)
- Hours worked per invoice
- Typical monthly hours

**Agent population:** Agent sends client list, rates, invoice history, hours.

### Project
Side projects with users, agents, and metrics. The passion becoming income.

**Data tracked:**
- Users (total, active, growth)
- Revenue (total, this month, trend)
- Costs (service, amount, period)
- Metrics (name, value, unit, trend)
- Decisions needing founder attention

**Agent population:** Agent sends user metrics, revenue, costs, decisions with priority.

## Top Floor: Comprehensive Business Dashboard

The top floor shows the full financial picture across all streams:

**Income In:**
- Day job variable pay (trailing average + range)
- Contract invoices and rates
- Project revenue

**Costs Out:**
- Per-bot/agent usage: Grok credits, OpenAI tokens
- Cloud APIs: Google Places, Gemini
- Subscriptions and services

**Key Metrics:**
- Total income, costs, net per month
- Net per stream
- Active vs total streams
- Time spent per stream
- Trends and variances

**What Needs Attention:**
- Weekly plan card: top priorities by expected payoff/hour
- Automation handled count: "Bureau handled 12 things this week"
- Needs-you queue: escalations from automation

**Optional:** Founder can set a "monthly need" for neutral comparison against total stream income, but this is not the headline or primary focus.

## The Building Stack

Each stream is a floor in the building. Click a floor to see detail.

**Per-floor display:**
- Stream name and type (Day Job, Contract, Project)
- One-line description
- Signal (PUSH, KEEP, PAUSE, KILL) if connected
- Net monthly income (income - costs)
- Monthly hours (if tracked)
- Users (projects only)
- "Not connected" state for streams without agents

**Visual:** Clean cards stacked vertically, Highstreet branding (purple #6253F1, cyan #00f2fe), not cartoonish.

## Agent-Populated Data

**Primary path:** Connect an agent, it populates the data automatically.

**Manual entry:** Available as an equal first-class option, not a buried fallback.

### Intake Flow

1. Founder connects agent to stream (or adds stream and chooses "Connect an agent")
2. Bureau sends structured intake request scoped to stream type
3. Agent returns JSON with data + metadata (source, as-of date per field)
4. **Review step:** Founder sees what agent found, approves before import
5. Agent pushes updates on heartbeat (hourly, daily, etc.)
6. Bureau shows freshness per field: "from Plumlist agent, 2h ago"
7. Flag stale data (>24h) or missing fields

### Data Sources

- **Real project data:** From connected agents (e.g., "Plumlist Agent")
- **SAMPLE data:** From MockProvider for demos, clearly labeled "SAMPLE DATA - not real"
- **Manual entry:** Founder-entered data, source: "Manual entry by founder"

**Rule:** SAMPLE data is excluded from portfolio totals and "Can I quit" calculations.

## Effective Hourly Rate

For each stream, show income per hour spent:
- Day job: annual salary / (hours per week × 52)
- Contract: total invoiced / hours worked
- Project: net monthly income / monthly hours (if tracked)

Helps founder see which streams are worth the time investment.

## Auditable Operating Record

**Every stream keeps an append-only audit trail** of its financial and operational history. This is the **single source of truth** for public and investor views in the future.

### What Gets Recorded

Each entry has:
- **Timestamp:** when recorded (ISO 8601)
- **Source:** who/what recorded it ("Plumlist Agent", "Manual entry by founder", "Bureau calculation")
- **Stream ID:** which stream this belongs to
- **Entry type:** income, cost, hours, decision, metric

**Income entries:**
```typescript
{
  timestamp: "2026-11-22T03:00:00Z",
  source: "Plumlist Agent",
  streamId: "plum-list",
  type: "income",
  amount: 0,
  period: "2026-11",
  description: "No revenue yet",
}
```

**Cost entries:**
```typescript
{
  timestamp: "2026-11-22T03:00:00Z",
  source: "Plumlist Agent",
  streamId: "plum-list",
  type: "cost",
  amount: 8.72,
  period: "2026-11",
  service: "Google Places API",
  category: "infrastructure",
}
```

**Hours entries:**
```typescript
{
  timestamp: "2026-11-22T03:00:00Z",
  source: "Manual entry by founder",
  streamId: "plum-list",
  type: "hours",
  hours: 3.5,
  period: "2026-11-21",
  description: "Fixed return tracking bug",
}
```

**Decision entries:**
```typescript
{
  timestamp: "2026-11-22T03:00:00Z",
  source: "Bureau decision engine",
  streamId: "plum-list",
  type: "decision",
  signal: "push",
  reasoning: "Critical blocker: return tracking not measurable",
  actions: ["Fix return tracking", "Push 4 unpushed syncs"],
  priority: 1,
}
```

### Audit Trail Properties

- **Append-only:** Never update or delete entries, only add corrections
- **Immutable:** Once written, entries cannot be changed
- **Timestamped:** Every entry has creation time
- **Attributed:** Every entry has a source (agent, founder, system)
- **Stream-scoped:** Each stream has its own independent trail

### Corrections and Revisions

If data needs to be corrected (e.g., agent reported wrong amount):
1. Add a new "correction" entry referencing the original
2. Original stays in the trail, marked as corrected
3. Latest value is used for current totals
4. Full history remains visible

```typescript
{
  timestamp: "2026-11-23T10:00:00Z",
  source: "Manual entry by founder",
  streamId: "plum-list",
  type: "correction",
  corrects: "entry-id-123",
  newValue: 10.25,
  reason: "Agent reported wrong Google Places cost",
}
```

## Future: Micro-Funding

**Long-term thesis:** Many people will run several small, good-enough businesses that together replace the 9-5. Bureau should eventually help those streams raise micro-funding from others, with returns paid as dividends or revenue share.

### The Bakery Example

Someone invests $500 up front in a small bakery. The business's details are transparent through dashboards that the owner chooses to make public to potential investors. This is a **micro-PE play**: small checks, real ownership or revenue participation, transparent operations.

### What This Requires

**Compliance:**
- Securities regulations (e.g., Reg CF in the US)
- Canadian provincial crowdfunding rules
- Investor accreditation checks
- Annual reporting requirements
- Legal agreements (SAFE, revenue share, equity)

**Technical:**
- Auditable financial record (we have this)
- Public investor view of chosen metrics (not built yet)
- Payment distribution system (dividends, revenue share)
- Investor account management
- Cap table or revenue share tracking

**Trust:**
- Immutable audit trail of income, costs, decisions
- Source attribution on every data point
- Public view reads ONLY from auditable record (never from draft/unverified data)
- Clear labeling of data freshness and gaps

### Per-Stream Share Settings

Each stream has visibility controls for future public/investor views:

```typescript
interface StreamShareSettings {
  visibility: 'private' | 'public-preview' | 'investor-only';
  
  // Per-field visibility for public/investor view
  publicFields: {
    monthlyIncome: boolean;      // Show monthly income
    monthlyCosts: boolean;       // Show monthly costs breakdown
    monthlyHours: boolean;       // Show hours worked
    userMetrics: boolean;        // Show user count, growth
    decisions: boolean;          // Show decision history
    auditTrail: boolean;         // Show full audit trail
    effectiveHourlyRate: boolean; // Show income per hour
  };
  
  // When this stream went public (if ever)
  publicSince?: string; // ISO timestamp
  
  // Who can see investor-only view
  investorEmails?: string[];
}
```

**Rules:**
- **Private by default:** New streams start private
- **Founder controls:** Only the founder can change visibility
- **Public view reads auditable record only:** No draft data, no unverified metrics
- **Granular:** Founder chooses which fields to share (e.g., show income but not costs)
- **Immutable history:** Public view shows historical data from audit trail, can't be edited retroactively

### Out of Scope For Now

- Public stream pages
- Investor dashboard UI
- Share purchase/payment flow
- Legal agreements and compliance
- Cap table or ownership tracking
- Distribution payments

**The groundwork being laid:**
1. ✅ Auditable operating record per stream
2. ✅ Source attribution on all data
3. ✅ Immutable append-only trail
4. ✅ Per-stream share settings in data model
5. ⏳ Public view reads from audit trail (data model ready, no UI)

## Philosophy Differences from Paperclip

Bureau borrows Paperclip's technical plumbing (adapters, heartbeats, task threads, budget enforcement, audit logs) but diverges philosophically:

**Paperclip:**
- Startups aiming for scale
- CEO/CTO roles and org charts
- "Hire the team" guidance
- $1M+ MRR goals
- VC-funded growth trajectory

**Bureau:**
- Solopreneurs (1-3 people) with day jobs
- Income streams, not companies
- Helpers and assistants (not hierarchy)
- Personal goals per stream
- Keep/push/pause/kill signals
- "Is this becoming real income?" mindset
- Multiple small, good-enough businesses
- Future: community-funded, not VC-funded

## Team Size

**Primary:** Solo founder with day job, checking in briefly

**Future:** 1-3 people per stream
- Each person has name, role, time allocation
- Tasks assignable to person or agent
- Time tracked per person
- Approval rights configurable

**Not big-org features:** No departments, no hierarchy, no HR processes

## Tone and Framing

- **Personal and encouraging**, not corporate
- "Your streams" not "your companies"
- "Helpers" not "org chart"
- "Income streams" not "portfolio companies"
- "Can I quit my 9-5?" not "Hit $1M ARR"
- "Keep/push/pause/kill" not "strategic initiatives"
- Plain language, inspectable numbers
- One clear answer, detail one click away
