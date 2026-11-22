# Bureau

**Command center for founders with day jobs running AI agent businesses.**

Bureau is where your project agents (Grok Bot, ChatGPT, etc.) report to, and you get ranked decisions on what to do next. Connect multiple agents per project, see their takes side-by-side, and let Bureau's deterministic engine be the tiebreaker. The product itself makes decisions—not humans, not chat.

## What is Bureau?

Bureau is your **portfolio command center** for managing multiple side projects while working a day job.

**How it works:**
1. Connect your project agents (Grok Bot, ChatGPT, etc.) to Bureau
2. Each agent reports project status (users, costs, blockers, pending work)
3. Bureau derives 1-3 decisions only you can make, ranked by priority
4. Connect multiple agents per project to get different "takes" on each decision
5. Bureau's deterministic engine breaks ties when agents disagree

**What Bureau tells you:**
- **Ranked "What to do next"** across all projects (with time estimates)
- **Agent takes side-by-side** (where they agree/disagree)
- **Bureau's verdict** as tiebreaker (deterministic, inspectable)
- **Founder-time budget** vs asks (weekly hours available vs needed)
- **Per-project signals** (keep / pause / kill / push with reasoning)

**Key principle:** The product (code) makes decisions. Agents report and advise. Bureau decides.

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

## Multi-Agent Support

### Connect Multiple Agents Per Project

Bureau supports multiple agents (Grok Bot, ChatGPT, Claude, etc.) reporting on the same project:

- Each agent submits its own status report
- Each agent provides its "take" on Bureau's decisions (approve / reject / modify / defer)
- Bureau shows takes side-by-side with agreement level (unanimous / majority / split)
- Bureau's deterministic engine breaks ties

### Agent Takes

When Bureau derives a decision (e.g. "Approve return-tracking fix"), connected agents can submit their takes:

```json
{
  "recommendation": "approve" | "reject" | "modify" | "defer",
  "reasoning": "Why I recommend this...",
  "confidence": "high" | "medium" | "low",
  "modifications": "If 'modify', what changes..."
}
```

### Bureau as Tiebreaker

When agents disagree, Bureau breaks ties using deterministic logic:
- Priority 1 + blocks a metric → Approve
- Low founder time cost (< 10 min) → Approve
- Split decision + no clear winner → Flag for review

Bureau's verdict always includes its reasoning and whether it broke a tie.

### Chat Adapter Interface (Prototype)

**Current implementation:** Manual copy/paste bridge
- Founder copies prompt from Bureau
- Pastes into Grok Bot or ChatGPT
- Copies agent's reply back to Bureau

**Production interface (plug in later):**

```typescript
interface ChatAdapter {
  provider: 'grok-bot' | 'chatgpt' | 'claude' | 'gemini';
  sendMessage(message: string, context?: string): Promise<string>;
  fetchTake(decisionContext: string): Promise<AgentTake>;
}
```

**To add a real provider:**
1. Implement `ChatAdapter` interface (see `lib/agent-connection-types.ts`)
2. Add API key/credentials via environment variables
3. Replace `MockChatAdapter` with your implementation

Example:
```typescript
class OpenAIChatAdapter implements ChatAdapter {
  provider = 'chatgpt';
  
  async sendMessage(message: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [{ role: 'user', content: message }],
      }),
    });
    const data = await response.json();
    return data.choices[0].message.content;
  }
  
  // ... implement fetchTake
}
```

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
