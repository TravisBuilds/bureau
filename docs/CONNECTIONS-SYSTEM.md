# Bureau Connections & Permissions System

**Design Document**  
Created: 2026-11-22  
Status: Prototype Implementation Complete

## Overview

Bureau's connection system handles authentication, permissions, and data access across all integrated services (X, ElevenLabs, Higgsfield, OpenAI, Grok Bot, GitHub, YouTube, Stripe, Gmail, etc.) with a focus on user control, security, and transparency.

## Core Principles

### 1. **In-Context, Per-Stream Permissions**

No big "connect everything" wall at signup. When you add a stream or enable a metric, Bureau asks only for what that specific feature needs.

**Example:** Adding the Elon stream prompts for X read access to show followers and engagement. Manual entry is always offered as an alternative.

### 2. **Least Privilege & Read-Only by Default**

- **Read scopes** are the default: Bureau pulls data but never acts without asking
- **Write/act scopes** are explicit upgrades tied to automation rules
- Every connection shows plainly:
  - What Bureau **will** read
  - What Bureau will **never** do
  - Which stream or bot uses it

### 3. **Multiple Connection Methods**

| Method | Use Case | Providers |
|--------|----------|-----------|
| **OAuth** | Secure token-based auth | X, Google/YouTube, GitHub, Stripe |
| **API Key** | Usage-only or admin keys | OpenAI, ElevenLabs, Higgsfield, Grok Bot |
| **Agent Intake** | Agent-fetched data with review | Day-job data, invoices, project metrics |
| **Manual Entry** | User enters values directly | Available for all metrics |

### 4. **Shared Credentials with Attribution**

One connection can feed multiple streams with per-stream attribution rules:

- **Example:** ElevenLabs connected once, used by both Ember and DuckDuckGoose
- Attribution by project, tag, or key: `project:ember`, `tag:kids-content`
- Avoids reconnecting the same service for each stream

### 5. **Team Ownership (1-3 People)**

- Connections belong to a person
- Streams can borrow connections with owner consent
- UI shows who connected what
- Revoke, downgrade, or reconnect your own grants

### 6. **Centralized Management**

The `/connections` page provides:
- **Status overview:** Total, active, revoked, shared connections
- **Per-connection details:** Provider, method, scopes, streams using it, last sync
- **Actions:** Reconnect, downgrade to read-only, revoke
- **Audit trail:** All grants, upgrades, downgrades, and revokes logged

### 7. **Security by Design**

- **AES-256-CBC encryption** server-side for all credentials
- Credentials never shown after save (only hints like `...abc123`)
- No credentials sent to client
- Mock provider used in prototype (no real OAuth apps or paid keys without approval)
- All operations logged in automation/audit log

## Connection Types

### OAuth Flow

1. User clicks "Connect with X (Twitter)"
2. Bureau redirects to provider OAuth page
3. User authorizes read-only access
4. Provider returns token (encrypted server-side)
5. Bureau syncs data on schedule

**Providers:** X, Google/YouTube, GitHub, Stripe

### API Key Flow

1. User clicks "Use API key"
2. Provider instructions shown with link to get key
3. User pastes key (usage-only or read-only)
4. Bureau validates and encrypts key
5. Key hint displayed: `...abc123`

**Providers:** OpenAI, ElevenLabs, Higgsfield, Grok Bot, Google Places/Gemini

### Agent Intake Flow

1. User connects agent to stream
2. Agent fetches data through its own auth
3. User reviews in IntakeReviewModal
4. Approve ✓ saves to auditable record
5. Data attributed to agent as source

**Use cases:** Day-job details, invoices, GitHub activity, project metrics

### Manual Entry

1. User clicks "Enter manually"
2. Form shows metric-specific fields
3. User updates values directly
4. Saved with manual source attribution

**Always available** as alternative to automated connections.

## In-Context Permission Prompt

When adding a stream or enabling a metric that requires a connection:

**Example: Connecting X for Elon stream**

```
╔══════════════════════════════════════════╗
║  Connect X (Twitter)                     ║
║  To show followers and engagement        ║
╠══════════════════════════════════════════╣
║  Bureau will read:                       ║
║    • Followers count                     ║
║    • Tweet impressions                   ║
║    • Engagement rate                     ║
║    • Your tweets                         ║
║                                          ║
║  Bureau will never:                      ║
║    • Post tweets                         ║
║    • Follow/unfollow users               ║
║    • Like or retweet                     ║
║    • Send DMs                            ║
╠══════════════════════════════════════════╣
║  [Connect with X (Twitter)]   OAuth     ║
║  [Enter manually]              Manual    ║
║  [Skip for now]                          ║
╠══════════════════════════════════════════╣
║  🔒 Credentials encrypted server-side    ║
║     Used by: Elon                        ║
╚══════════════════════════════════════════╝
```

**Component:** `ConnectionPrompt.tsx`  
**Screenshot:** `screenshots/connections/connection-prompt.png`

## Connections Management Page

**Route:** `/connections`

### Top Summary Cards

- **Total:** All connections
- **Active:** Currently syncing
- **Revoked:** User-revoked (history kept)
- **Shared:** Used by multiple streams

### Connection List

Each connection row shows:

**Main View:**
- Provider icon and name (e.g., 🎙️ ElevenLabs)
- Status badge: `connected`, `stale`, `revoked`, `expired`, `error`
- Method: OAuth or API Key
- Scopes: `read`, `write`, `act` badges with color coding
- Streams using it: Tags for each stream (with attribution rules)
- Last sync: "2h ago", "3d ago", etc.

**Expanded View:**
- Connected by: Name of person who connected
- Connected at: Timestamp
- Account: OAuth account name/ID or API key hint
- Expires at: For OAuth tokens
- Security notes: Encryption, logging, etc.
- Actions: Reconnect, Downgrade, Revoke buttons

### Actions

| Action | What It Does | Logged As |
|--------|--------------|-----------|
| **Reconnect** | Refresh expired token or re-enter key | `reconnected` |
| **Downgrade** | Remove write/act scopes, keep read-only | `scopes-downgraded` |
| **Revoke** | Stop syncing, keep history | `revoked` |

**Screenshot:** `screenshots/connections/connections-page.png`

## Shared Resource Attribution

### ElevenLabs Example

**Connection:**
- Provider: ElevenLabs
- Method: API Key (read-only)
- Streams using it:
  - Ember (project:ember)
  - DuckDuckGoose (project:duckduckgoose)

**Usage Tracking:**
- Total: 1,962 of 62,263 characters used
- Resets: Dec 12
- Needs attribution by project tag to split usage

**Current State:** Shared connection visible on Connections page, usage shown as aggregate until attribution rules configured.

### Higgsfield Example

**Connection:**
- Provider: Higgsfield
- Method: API Key
- Plan: Ultimate
- Credits: 3,953 remaining
- Note: "May not be the harness billing account"

**Streams using it:**
- Studio · Peak Glow Up (needs tagging by episode)

## Real Data Integration (Nov 21, 2026)

### Connected Streams

All four streams now show real metrics with sources:

1. **DuckDuckGoose**
   - Source: GitHub TravisBuilds/DuckDuckGoose
   - Metrics: 296 commits (30d), 36 PRs merged, 6 open PRs

2. **Elon**
   - Source: X API @SadCreatorTalks
   - Metrics: 18,972 followers (-62 since Nov 5), 5.27% engagement
   - **Attention item:** Negative follower growth

3. **Studio · Peak Glow Up**
   - Source: Private Drive + Studio ledger
   - Metrics: 5 episodes locked, 0 published
   - **Attention item:** 5 ready, 0 distributed

4. **Ember**
   - Source: YouTube @BedtimewithEmber-i9n
   - Metrics: 12 Shorts published, 212 views, 3 subscribers

### Not Connected States

Metrics without connections show:
- Empty state with dashed border
- "Not connected" message
- Clear CTA: "Connect data source"
- **Never** show "$0 earned" or invented estimates

**Examples:**
- DuckDuckGoose: Pipeline success rate, revenue (needs studio ledger)
- Ember: Watch time, retention (needs YouTube Analytics)
- Studio: Ep04 spend (no documented rate for credits-to-USD)

## Security & Compliance

### Prototype Constraints

- ✅ **Mock provider** used for all testing
- ✅ **No real OAuth apps** without Travis's approval
- ✅ **No paid API calls**
- ✅ **AES-256-CBC encryption** implemented
- ✅ **Server-side only** credential storage
- ❌ **Do not deploy** without legal review

### Audit Trail

Every connection operation logged:
- `connected` — Initial OAuth or API key saved
- `scopes-upgraded` — Added write/act permissions
- `scopes-downgraded` — Removed write/act, kept read
- `revoked` — User stopped syncing
- `reconnected` — Refreshed token or re-entered key
- `sync-success` — Data pulled successfully
- `sync-failed` — Connection error
- `stream-added` — Stream started using connection
- `stream-removed` — Stream stopped using connection

**Data Structure:** `lib/connection-types.ts` → `ConnectionAuditEntry`

### Credential Storage

**Location:** `data/credentials/` (gitignored)  
**Format:** Encrypted JSON per connection  
**Algorithm:** AES-256-CBC with IV  
**Client Exposure:** Never — `sanitizeForClient()` strips sensitive fields

## UI Locations

| Page | Route | Purpose |
|------|-------|---------|
| **Top Floor** | `/top-floor` | Stream cards with "Connections" button |
| **Connections** | `/connections` | Manage all connections centrally |
| **Stream Detail** | `/stream-detail/[id]` | Shows data sources per stream |
| **Connection Prompt** | Modal | In-context permission request |

## Component Architecture

### Key Components

**`ConnectionPrompt.tsx`**
- Modal dialog for in-context permission requests
- Shows provider info, what Bureau reads/never does
- Offers OAuth, API key, agent, or manual entry
- Security note at bottom

**`MetricStreamCard.tsx`**
- Stream card on Top Floor
- Shows 2-4 headline metrics
- Empty state for not-connected metrics
- Color-codes negative growth, attention items

**Stream Detail Pages**
- Full metrics with sources and timestamps
- Attention items at top
- Connection status indicator
- "Not Connected" section with CTAs

### Data Types

**Core Types:** `lib/connection-types.ts`
- `Connection` — A credential grant
- `ConnectionRequirement` — What a metric needs
- `ConnectionPrompt` — In-context request
- `ConnectionAuditEntry` — Audit log entry
- `ProviderDefinition` — Provider metadata

**Metric Types:** `lib/stream-metrics-types.ts`
- `MetricStream` — Stream with metric definitions
- `MetricValue` — Value at timestamp with source
- `MetricDefinition` — Metric label, unit, kind

## Testing

### Manual Test Checklist

- [x] Build passes without errors
- [x] Connections page renders all connection states
- [x] Connection prompt shows for each provider type
- [x] Shared connections display attribution
- [x] Revoke keeps history, stops syncing
- [x] Downgrade removes write scopes
- [x] Real data shows with sources
- [x] Not-connected states show empty CTAs
- [x] Attention items appear on Top Floor
- [x] Negative growth shows in red
- [ ] OAuth flow (mock only in prototype)
- [ ] API key validation
- [ ] Shared resource splitting with attribution rules

### Screenshots

**Included:**
1. `screenshots/connections/connections-page.png` — Full Connections management page
2. `screenshots/connections/connection-prompt.png` — In-context permission prompt
3. `screenshots/top-floor-real-data.png` — Top Floor with 4 real streams and attention items
4. `screenshots/stream-detail-elon.png` — Elon stream detail with negative growth
5. `screenshots/stream-detail-studio.png` — Studio stream with unpublished warning

## Next Steps

### Before Production

1. **Legal review** of micro-funding + securities compliance
2. **Real OAuth apps** registered with providers
3. **API key validation** per provider
4. **Attribution rules UI** for shared resources
5. **Webhook handlers** for OAuth callbacks
6. **Encryption key rotation** strategy
7. **Rate limiting** on sync operations
8. **Error recovery** for failed syncs

### Feature Roadmap

- [ ] Write/act scope approval workflow
- [ ] Automation rules triggering on connection events
- [ ] Multi-account support (multiple X accounts, etc.)
- [ ] Connection health monitoring
- [ ] Usage quotas and warnings
- [ ] Team invitation flow
- [ ] Connection sharing approval UI

## References

**Documentation:**
- [VISION.md](./VISION.md) — Product vision and micro-funding context
- [COMPLIANCE.md](./COMPLIANCE.md) — Legal/regulatory requirements
- [UI-SIMPLIFICATION.md](./UI-SIMPLIFICATION.md) — Manual-first UI principles

**Code:**
- `lib/connection-types.ts` — Type definitions
- `lib/sample-connections.ts` — Sample data for prototype
- `lib/real-stream-data.ts` — Real metrics with sources
- `components/ConnectionPrompt.tsx` — Permission prompt
- `app/connections/page.tsx` — Management page
- `app/connection-prompt-demo/page.tsx` — Demo for screenshots

**Screenshots:**
- `/screenshots/connections/` — Connections system visuals
- `/screenshots/automation/` — Rules and costs tabs
