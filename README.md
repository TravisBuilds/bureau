# Bureau

**Decision intelligence for solo founders running AI agent businesses.**

Bureau is a command center that tells founders at a glance whether they have a real business — from "not yet" to "yes, quit your day job." It doesn't use LLMs or chat; the product itself makes deterministic, testable decisions based on your business metrics.

## What is Bureau?

Bureau answers the core question every solo founder asks: **"Is this a real business?"**

It evaluates:
- Agent task costs (how much your AI agents cost to run)
- User metrics and engagement
- Revenue and contribution margins
- Break-even math
- Cost scaling with users

And outputs:
- **A verdict** (`quit_your_day_job`, `keep_going`, `not_yet`, `not_enough_evidence`, or `stop`)
- **Pricing recommendations** (set price vs free with cost cap)
- **Open-to-users decision** (should you open to more users or keep it closed?)
- **Agent action briefs** (what your agents should do next)

**Key principle:** The product (code) makes decisions, not humans or chat agents. Bureau IS the brain.

## Quick Start

### Install dependencies
```bash
npm install
```

### Run the web app
```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000)

### Run tests
```bash
npm test
```

### CLI Usage (for AI agents)

Evaluate Plum List (the baseline example):
```bash
npm run evaluate -- --business "Plum List"
```

Evaluate from your own JSON file:
```bash
npm run evaluate -- --file my-business.json
```

List all seed business examples:
```bash
npm run evaluate -- --list
```

Output is printed to the terminal AND saved to `bureau-decision.json`.

## API Usage (for AI agents)

Bureau provides a JSON API that agents can call:

### POST /api/evaluate

Submit business data, receive a decision.

**Request:**
```json
{
  "businessName": "My AI App",
  "agentTasks": [
    {
      "name": "User Query Processing",
      "costUSD": 0.10,
      "timeMinutes": 2,
      "frequency": "per_action"
    }
  ],
  "servingCosts": [],
  "userMetrics": {
    "totalUsers": 50,
    "activeUsers": 40,
    "actionsPerUserPerMonth": 10
  },
  "revenue": {
    "monthlyRevenue": 500
  },
  "founderTime": {
    "hoursPerWeek": 20
  }
}
```

**Response:**
```json
{
  "verdict": "not_yet",
  "confidence": "medium",
  "keyFacts": [...],
  "pricingRecommendation": {...},
  "openToUsersRecommendation": {...},
  "breakEvenMetrics": {...},
  "agentActionBrief": "VERDICT: ...\nPRIORITY: ...\nPRICING: ...\nACCESS: ...",
  "timestamp": "2026-11-22T02:00:00.000Z"
}
```

### GET /api/evaluate

Returns the full JSON schema documentation.

## Architecture

### Decision Engine (`lib/engine.ts`)

Pure functions, no LLM calls. All logic is deterministic and testable.

**Key functions:**
- `evaluateBusiness()` - Main decision function
- `calculateBreakEven()` - Cost per user, break-even pricing
- `determineVerdict()` - Core verdict logic
- `generatePricingRecommendation()` - Pricing strategy
- `generateOpenToUsersRecommendation()` - User access decisions

Every output carries its "why" — which inputs and rules produced it.

### Data Types (`lib/types.ts`)

Complete TypeScript interfaces for:
- Business inputs
- Agent tasks
- User metrics
- Revenue data
- Decisions and recommendations

### Seed Data (`lib/seed-data.ts`)

10 realistic business scenarios:
- Plum List (AI consumer app, real baseline data)
- Profitable SaaS
- Local bakery
- Casual restaurant
- Failed startup
- Boutique vineyard
- Real estate agent
- Content creator/dancer
- Early stage idea
- Consulting business

### UI Components

- `VerdictDisplay` - The big verdict card at the top
- `KeyFactsDisplay` - Inspectable key facts with calculations
- `BreakEvenCalculator` - Interactive calculator with sliders
- `DecisionCard` - Pricing and access recommendations
- `DataEditor` - JSON editor with import/export

## Design Philosophy

1. **Win on UI and efficiency** - Clean, visual, inspectable
2. **The product decides** - Not humans, not chat agents
3. **Cost scales with users** - Every decision models this
4. **Testable and deterministic** - No LLM magic, just math
5. **Agent-readable** - Everything has a JSON interface

## User Types

Bureau serves two types of founders:

1. **Already started** (current focus): You have users, revenue, costs — Bureau evaluates your business
2. **No idea yet** (future): Bureau extracts your passions and suggests ideas (stub only)

## Example: Plum List Baseline

The app is seeded with real data from Plum List:
- 15 total users, 8 active
- AI curation: $0.15/action
- API costs: $0.02/action
- Zero revenue (not monetized yet)
- 10 hours/week founder time

**Bureau's verdict:** "Not enough evidence" with free tier + $50/month cost cap recommendation.

## Development

### Project Structure
```
├── lib/
│   ├── types.ts              # TypeScript interfaces
│   ├── engine.ts             # Decision engine (pure functions)
│   ├── seed-data.ts          # Business scenarios
│   └── engine.test.ts        # Unit tests
├── app/
│   ├── page.tsx              # Home page
│   └── api/evaluate/
│       └── route.ts          # API endpoint
├── components/               # React components
└── scripts/
    └── evaluate.ts           # CLI tool
```

### Tech Stack
- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Testing:** Vitest
- **Storage:** localStorage (browser) + JSON files (CLI)

### Running Locally

1. Install dependencies: `npm install`
2. Run tests: `npm test`
3. Start dev server: `npm run dev`
4. Open: http://localhost:3000

No deployment, no paid APIs, no secrets required.

## Testing

35+ unit tests covering:
- All business scenarios (Plum List → consulting business)
- Break-even calculations
- Key facts extraction
- Verdict logic (all 5 levels)
- Pricing recommendations
- Open-to-users decisions
- Agent action briefs
- Edge cases (zero users, zero revenue, missing data)

Run tests:
```bash
npm test          # Run once
npm run test:watch # Watch mode
```

## Future: Long-term Vision

Bureau is designed to become:
- **Business health intelligence** - Track metrics over time
- **Trustworthy operating record** - For advisors and micro-VCs
- **Decision archive** - Historical decisions and outcomes

The data model supports this, but it's not built yet.

## License

MIT

---

**Bureau v1.0** - Built for solo founders running businesses with AI agents.
