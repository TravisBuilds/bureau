# Agent Integration Strategy

**Problem:** Multiple AI providers (OpenAI, Cursor, Anthropic, webhooks) with different APIs, capabilities, and pricing could create UI chaos.

**Solution:** One uniform adapter contract. Provider differences stay inside the adapter. Bureau routes tasks intelligently.

## Core Principles

### 1. One Adapter Contract

Every agent provider implements the same interface:

```typescript
interface AgentProvider {
  connect(params): Promise<AgentCredentials>;
  capabilities(): Promise<Capability[]>;
  dispatch(task, helper): Promise<TaskResult>;
  status(taskId): Promise<TaskStatus>;
  result(taskId): Promise<TaskResult>;
  chat(message, conversationId): Promise<Response>;
}
```

**Provider differences stay inside the adapter.** OpenAI's API quirks, Cursor's auth flow, webhook formats — all hidden from Bureau's core.

### 2. Agents Described by Capability, Not Brand

Agents are NOT "ChatGPT", "Claude", "Grok Bot". They are:

- **Capability**: code, research, content, ops, design, data
- **Cost**: cheap, moderate, expensive ($/hour estimate)
- **Speed**: fast, medium, slow (minutes to completion)

Example:
```json
{
  "id": "helper-1",
  "name": "Code Helper",
  "capabilities": ["code", "testing"],
  "costTier": "moderate",
  "speedTier": "fast",
  "provider": "openai",
  "model": "gpt-4"
}
```

**Why:** Bureau routes tasks to the best helper based on what's needed, not which brand you prefer. If a task needs code and speed, Bureau picks the fast code helper. If it needs research and cheap, Bureau picks the cheap research helper.

### 3. Bureau Routes, User Approves

**How task dispatch works:**

1. User wants to do a task (or Bureau suggests one)
2. Bureau looks at task requirements: "code, 15 min estimate, priority 1"
3. Bureau finds best helper: fast code helper with availability
4. UI shows: "**Suggested helper:** Code Helper • $0.50 estimated • 15 min" with "Change" button
5. User clicks "Send" to approve, or "Change" to pick different helper
6. Task dispatched to chosen helper

**NOT this:** Show 5 buttons ("Send to ChatGPT", "Send to Claude", etc.). That's clutter.

### 4. One Unified Task Thread

All agent results land in the same format:

```typescript
interface TaskResult {
  taskId: string;
  summary: string;         // Plain English: what was done
  evidence: string[];      // Links, screenshots, test results
  cost: number;            // Dollars spent
  timeSpent: number;       // Minutes taken
  needsApproval: boolean;  // Does founder need to approve?
  status: 'completed' | 'failed' | 'blocked';
  blockers?: string[];     // If blocked, what's blocking?
}
```

**One inbox.** No "ChatGPT results" tab vs "Claude results" tab. All results in one task board, same format.

### 5. Multi-Agent Takes: Opt-In, Capped

**Default:** One agent does the work.

**Two-takes mode:** When you want different perspectives on a decision.

**How it works:**
- Founder opts in: "Get takes from 2 agents"
- Bureau asks 2-3 agents (capped, not all)
- Results shown side-by-side in comparison card
- Bureau highlights agreement/disagreement
- Founder makes final call

**When to use:**
- Real decisions with tradeoffs
- When you're unsure and want perspectives
- NOT for routine tasks

**NOT this:** Automatically ask 5 agents for every task. That's expensive and slow.

### 6. Agent Ownership & Budget

Each agent belongs to one income stream:

```typescript
interface Helper {
  id: string;
  streamId: string;              // Which stream owns this
  name: string;
  capabilities: Capability[];
  monthlyBudget: number;         // Dollars per month this helper can spend
  spent: number;                 // Dollars spent so far
  status: 'active' | 'paused';
  permissions: {
    canAccessFiles: boolean;
    canDeployCode: boolean;
    canSpendMoney: boolean;
  };
}
```

**One "Helpers" screen** shows all helpers for a stream:
- Name, capabilities, status
- Budget: $X spent of $Y limit
- Health: active, paused, over-budget
- Actions: configure, pause, remove

**NOT this:** Org chart with hierarchy. Just a list.

### 7. Agent Chatter is Hidden

**What users DON'T see:**
- Agent-to-agent communication
- Internal reasoning loops
- Debug logs
- API call traces

**What users DO see:**
- Outcomes: "Task completed: deployed fix to production"
- Blockers: "Blocked: need API key for payment provider"
- Approvals: "Needs you: approve this pricing change"

**Why:** Humans don't need to see agents talking to each other. They need to see results and decisions.

## Implementation Checklist

### Adapter Layer ✅
- [x] AgentProvider interface (`lib/agent-provider-interface.ts`)
- [x] MockProvider for testing (`lib/providers/MockProvider.ts`)
- [ ] OpenAI adapter
- [ ] Cursor adapter
- [ ] Webhook adapter

### UI Components
- [x] YourHelpersPage: list all helpers with health/spend
- [ ] Smart task routing: suggest best helper per task
- [ ] Unified task inbox: same format for all results
- [ ] Two-takes comparison card: opt-in multi-agent
- [ ] Helper configuration: capabilities, budget, permissions

### Backend
- [x] Credential storage (encrypted server-side)
- [x] Task dispatch API (`/api/tasks`)
- [ ] Task routing logic (match task to best helper)
- [ ] Budget enforcement (pause at limit)
- [ ] Result normalization (convert provider responses to TaskResult)

## Examples

### Good: Smart Routing

```
Task: "Fix login bug"
Requires: code, fast, high priority

Bureau suggests: "Code Helper (fast, $0.75 est.)"
Alternative: "Research Helper (slow, $0.25 est.)" [Change]

User clicks: Send → Task dispatched
```

### Good: Unified Result

```
Task #42: Fix login bug
Agent: Code Helper
Status: ✓ Completed

Summary: Fixed null pointer in auth flow
Evidence:
  - PR #123: https://github.com/...
  - Tests: 12/12 passing
Cost: $0.80
Time: 18 minutes

[Approve] [Request Changes]
```

### Bad: Brand-First UI

```
❌ Send to ChatGPT
❌ Send to Claude
❌ Send to Grok Bot
❌ Send to Gemini
```

This is clutter. User doesn't care which brand, they care about capability + cost.

### Bad: Per-Agent Tabs

```
❌ [ChatGPT Results] [Claude Results] [Grok Results]
```

This fragments the inbox. All results should be in one place.

## Migration Path

**Phase 1 (Current):** MockProvider, basic dispatch
- ✅ One adapter interface
- ✅ Mock provider for testing
- ✅ Helpers page (simple list)

**Phase 2:** Smart routing
- Add capability matching
- Suggest best helper per task
- "Change helper" option in UI

**Phase 3:** Real providers
- OpenAI adapter
- Cursor adapter
- Budget enforcement

**Phase 4:** Multi-agent takes
- Two-takes comparison card
- Opt-in flow
- Cap at 2-3 agents

## Anti-Patterns to Avoid

❌ **Per-agent tabs:** Fragments the UI  
❌ **Brand-first routing:** "Send to ChatGPT"  
❌ **Automatic multi-agent:** Expensive, slow  
❌ **Exposed agent chatter:** Noise, not signal  
❌ **Complex org charts:** This isn't a corporation  
❌ **Provider-specific UI:** Leaks adapter details  

## Success Criteria

✅ **Adding a new provider takes < 1 day** (just implement the adapter)  
✅ **UI never mentions brand names** (capabilities only)  
✅ **One inbox, one task board** (unified view)  
✅ **Budget limits enforced** (never overspend)  
✅ **Multi-agent is opt-in** (not default)  

---

**Result:** Bureau stays clean and focused. Agents are helpers that disappear into the background. The founder sees outcomes, not plumbing.
