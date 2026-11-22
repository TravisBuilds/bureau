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

## Real Agent Connections & Task Dispatch

**Bureau is now the central command for your project agents.**

### Core Capabilities

1. **Sign In Agents** - Connect via OAuth or API key (server-side encrypted)
2. **Task Dispatch** - Send tasks from Bureau to your agents
3. **Task Board** - Track queued/running/done/needs-founder
4. **Live Chat** - Chat through providers' APIs (not copy/paste)
5. **Multi-Agent Takes** - Different agents provide recommendations side-by-side

### Architecture

```
┌─────────────────────────────────────────────────┐
│                    Bureau                        │
│  (Deterministic Decision Engine + Central Cmd)   │
└─────────────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
   ┌────▼────┐   ┌───▼────┐   ┌───▼────┐
   │ OpenAI  │   │ Cursor │   │ Custom │
   │ Agents  │   │ Agents │   │Webhooks│
   └─────────┘   └────────┘   └────────┘
```

### Provider Interface

All providers implement:

```typescript
interface AgentProvider {
  type: ProviderType;
  connect(params: { apiKey?, oauthCode?, webhookUrl?, mcpConfig? }): Promise<AgentCredentials>;
  listAgents(credentials: AgentCredentials): Promise<ConnectedAgent[]>;
  dispatchTask(agentId, brief, context, credentials?): Promise<TaskDispatchResult>;
  getTaskStatus(taskId, credentials?): Promise<AgentTask>;
  streamTask(taskId, credentials?): AsyncIterableIterator<string>;
  getTaskResult(taskId, credentials?): Promise<string>;
  sendMessage(agentId, message, conversationId?, credentials?): Promise<{ messageId, response }>;
}
```

### Security Architecture

**Server-side credential storage only. Credentials NEVER exposed to client.**

- **Encryption**: AES-256-CBC with IV (unique per credential)
- **Storage**: `data/credentials/` (gitignored, server-side only)
- **API**: All credential operations in API routes, never client components
- **Sanitization**: `sanitizeForClient()` strips sensitive fields before responses
- **Environment**: `BUREAU_ENCRYPTION_KEY` env var (defaults to dev key with warning)

```typescript
// Server-side only
const { encrypted, iv } = encryptCredential(apiKey);
storeCredentials(projectName, providerId, { encrypted, iv });

// API responses always sanitized
const response = sanitizeForClient(credentialsObj);
// response.encrypted = undefined (removed)
// response.iv = undefined (removed)
```

### Supported Providers

| Provider | Auth Method | Status | Setup |
|----------|-------------|--------|-------|
| **Mock** | API Key | ✅ Implemented | No setup needed (dev mode) |
| **OpenAI** | API Key | 📋 Planned | Requires OPENAI_API_KEY |
| **Cursor Agents** | OAuth | 📋 Planned | OAuth flow + project linking |
| **Custom Webhook** | URL + Secret | 📋 Planned | POST endpoint implementing interface |
| **MCP** | Config | 📋 Planned | MCP server config |

### Task Lifecycle

```
Bureau → dispatch(agent, brief, context)
  ↓
Queued → Running → Completed
  ↓                    ↓
Agent executes    Needs Founder?
                       ↓
                  Approve/Reject
```

**Task Board shows:**
- Queued: Waiting to start
- Running: Agent is working
- Needs Founder: Waiting for your approval/rejection
- Completed: Done (approved)
- Failed: Error (see logs)

### Development Mode (Mock Provider)

The mock provider simulates realistic async task execution **without any paid API calls**:

- Returns 2 mock agents: "Mock Agent Alpha" and "Mock Agent Beta"
- Simulates 3-second task execution (queued → running → completed)
- Provides chat responses with echo
- NO real API calls, NO credits spent

**How to test:**
1. Start dev server: `npm run dev`
2. Open a project detail page
3. Click "Manage Connections"
4. Connect "Mock Provider" (any API key works)
5. Dispatch tasks from "What to do next" items
6. Watch Task Board for status updates
7. Chat with mock agents in live chat panel

### Plugging in Real Providers

To add a real provider (OpenAI, Cursor, etc.):

1. **Implement the interface** in `lib/providers/YourProvider.ts`:
```typescript
export class OpenAIProvider implements AgentProvider {
  type = 'openai' as const;
  
  async connect(params: { apiKey: string }): Promise<AgentCredentials> {
    // Validate API key with OpenAI
    // Return encrypted credentials
  }
  
  async listAgents(credentials: AgentCredentials): Promise<ConnectedAgent[]> {
    // List available OpenAI agents
  }
  
  async dispatchTask(agentId: string, brief: string, context?: string, credentials?: AgentCredentials): Promise<TaskDispatchResult> {
    // Start OpenAI agent task
  }
  
  // ... implement remaining methods
}
```

2. **Register in factory** (`lib/agent-provider-interface.ts`):
```typescript
export function getProvider(type: ProviderType): AgentProvider {
  switch (type) {
    case 'openai': return new OpenAIProvider();
    case 'mock': return new MockProvider();
    // ...
  }
}
```

3. **Update connection UI** (`components/ConnectionsPage.tsx`):
- Show setup instructions for your provider
- Handle provider-specific auth flow (OAuth vs API key)

4. **Add tests** (`lib/providers/YourProvider.test.ts`):
- Mock HTTP calls (never hit real APIs in tests)
- Test connection, list, dispatch, status, chat
- Test error cases

### What You Need to Supply (Real Providers)

**For OpenAI:**
- OpenAI API key (from https://platform.openai.com/api-keys)
- Agents created in OpenAI Agents API
- Budget limits configured

**For Cursor Agents:**
- OAuth app registration with Cursor
- CLIENT_ID and CLIENT_SECRET in `.env.local`
- Redirect URI: `http://localhost:3000/api/auth/callback/cursor`

**For Custom Webhooks:**
- POST endpoint implementing AgentProvider interface
- Webhook secret for HMAC signing
- Agent list endpoint

**For MCP:**
- MCP server config (stdio or HTTP)
- Server binary or URL
- Authentication tokens

### Environment Variables

**Quick Start:**
1. Copy `.env.example` to `.env.local`
2. Fill in your Supabase credentials
3. Generate an encryption key: `openssl rand -base64 32`

**Required for production:**
```bash
# Database (from Supabase Project Settings > Database)
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres
DATABASE_URL_ADMIN=postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres

# Authentication (from Supabase Project Settings > API)
NEXT_PUBLIC_SUPABASE_URL=https://[PROJECT].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Encryption for credential storage
BUREAU_ENCRYPTION_KEY=your-32-char-encryption-key-here

# Your production URL (for email redirect links)
NEXT_PUBLIC_SITE_URL=https://bureau.yourdomain.com
```

**Optional:**
```bash
# LLM-powered weekly review (disabled by default)
BUREAU_ENABLE_LLM_REVIEW=true
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
```

**Local Development:**
- Omit `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to use local auth
- Magic links will be logged to console instead of sent via email
- Sessions stored in local database

**Security warning:** Never commit `.env.local` to git. The encryption key is used to encrypt all stored credentials.

### Authentication Setup

**For Production (Vercel + Supabase):**

1. **Configure Supabase Auth:**
   - Go to Authentication > URL Configuration in Supabase dashboard
   - Set **Site URL** to your production URL: `https://bureau.yourdomain.com`
   - Add **Redirect URLs**: `https://bureau.yourdomain.com/auth/callback`
   - Enable Email provider in Authentication > Providers
   - Customize email templates in Authentication > Email Templates (optional)

2. **Set Environment Variables in Vercel:**
   - Add all required env vars from `.env.example`
   - Set `NEXT_PUBLIC_SITE_URL` to your production domain
   - Supabase will send magic link emails automatically (no email provider account needed)

3. **Invite Codes:**
   - Pilot access requires invite codes: `BUREAU_PILOT_001` through `BUREAU_PILOT_005`
   - Manage invites in `pilot_invites` table or via admin page

**For Local Development:**
- Just set `DATABASE_URL` and `BUREAU_ENCRYPTION_KEY`
- Omit Supabase env vars to use local auth
- Magic links logged to console for testing

## Development

### Project Structure
```
├── lib/
│   ├── decision-engine-v2.ts        # Decision engine (pure functions)
│   ├── agent-report-types.ts       # TypeScript interfaces
│   ├── agent-reports-seed.ts       # Real project data (Plum List)
│   ├── agent-provider-interface.ts # Provider interface
│   ├── credential-storage.ts       # Server-side encryption
│   ├── take-comparison.ts          # Multi-agent take logic
│   ├── providers/
│   │   ├── MockProvider.ts         # Mock provider (dev mode)
│   │   └── [future providers]      # OpenAI, Cursor, etc.
│   └── *.test.ts                   # Unit tests (82 tests)
├── app/
│   ├── page.tsx                    # Portfolio home
│   └── api/
│       ├── connections/route.ts    # Connect agents
│       ├── tasks/route.ts          # Dispatch & track tasks
│       └── chat/route.ts           # Live chat
├── components/
│   ├── PortfolioHome.tsx           # Portfolio view
│   ├── ProjectDetailView.tsx       # Project detail
│   ├── ConnectionsPage.tsx         # Agent sign-in
│   ├── TaskBoard.tsx               # Task tracking
│   └── LiveChatPanel.tsx           # Live chat UI
├── data/                           # Gitignored storage
│   ├── credentials/                # Encrypted credentials
│   └── tasks/                      # Task metadata
└── screenshots/                    # Walkthrough artifacts
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

82 unit tests covering:

**Decision Engine (24 tests):**
- Plum List fixture validation (26 users, 4 syncs, $9.97 costs)
- Next action derivation (priority 1 = return-tracking fix)
- Founder signal (PUSH or KEEP, not PAUSE without budget)
- Break-even calculations
- Time asks vs budget

**Take Comparison (16 tests):**
- Agreement detection (unanimous/majority/split)
- Bureau's tie-breaking logic
- Disagreement identification
- Example take validation

**Agent Providers (12 tests):**
- Mock provider connection
- Agent listing
- Task dispatch lifecycle (queued → running → completed)
- Task streaming
- Chat with conversation context

**Security (12 tests):**
- Credential encryption/decryption
- Different IVs for same input
- Client sanitization (strips sensitive fields)
- API responses never expose credentials

**Plus 18 more tests** for metrics calculation, project status, and utilities.

Run tests:
```bash
npm test              # Run once (all 82 tests)
npm run test:watch    # Watch mode
npm test -- --ui      # Visual UI
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
