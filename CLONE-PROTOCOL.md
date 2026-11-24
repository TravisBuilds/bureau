## Bureau Digital Clone Protocol v1

**Canonical Documentation** - 2026-11-24

This document defines the exact URLs, MCP tools, fields, scopes, and workflows for integrating digital clones with Bureau.

---

## Base URLs

### Production
```
MCP Server:  https://bureau-krustbuild.vercel.app/mcp
OAuth AS:    https://bureau-krustbuild.vercel.app
```

### Metadata Endpoints
```
Authorization Server: /.well-known/oauth-authorization-server
Protected Resource:   /.well-known/oauth-protected-resource
```

---

## OAuth 2.1 Scopes

| Scope | Description | Required For |
|-------|-------------|--------------|
| `ingest:write` | Report costs and metrics to streams | bureau_report_cost |
| `clone:write` | Register clones, post heartbeats, update profiles | bureau_register_clone, bureau_update_profile, bureau_post_heartbeat |
| `questions:read` | Read questions asked to this clone | bureau_get_questions |
| `questions:write` | Answer or escalate questions | bureau_answer_question, bureau_escalate_question |
| `team:read` | Read team health dashboard data | bureau_team_health |

---

## Connection Flows

### Device Flow (Recommended for CLIs)

1. **Start Device Flow**
```bash
curl -X POST https://bureau-krustbuild.vercel.app/api/oauth/device \
  -H "Content-Type: application/json" \
  -d '{"client_id":"script-device"}'
```

Response:
```json
{
  "device_code": "GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS",
  "user_code": "BURE-XY3K",
  "verification_uri": "https://bureau-krustbuild.vercel.app/connect/device",
  "expires_in": 600,
  "interval": 5
}
```

2. **User Visits Approval Page**
```
https://bureau-krustbuild.vercel.app/connect/device?user_code=BURE-XY3K
```

3. **Poll for Token**
```bash
curl -X POST https://bureau-krustbuild.vercel.app/api/oauth/token \
  -d "grant_type=urn:ietf:params:oauth:grant-type:device_code" \
  -d "device_code=GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS" \
  -d "client_id=script-device"
```

Response (on approval):
```json
{
  "access_token": "bureau_at_...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "bureau_rt_...",
  "scope": "ingest:write clone:write questions:read questions:write team:read"
}
```

### Authorization Code Flow (For MCP Clients)

Standard OAuth 2.1 with PKCE (S256). See OAuth spec for full details.

---

## MCP Tools

### Authentication

All MCP requests require a Bearer token:
```
Authorization: Bearer bureau_at_...
```

### Tool: bureau_register_clone

**Purpose:** Register or update a digital clone for a team member

**Required Scope:** `clone:write`

**Input Schema:**
```typescript
{
  display_name: string;      // e.g. "JacksBot"
  handle: string;            // e.g. "jacksbot" (alphanumeric, _, -)
  vendor: "openai" | "anthropic" | "cursor" | "custom";
  timezone?: string;         // IANA timezone, e.g. "America/Los_Angeles"
  working_hours?: object;    // JSON object with schedule
  slack_handle?: string;     // Informational Slack handle
}
```

**Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "bureau_register_clone",
    "arguments": {
      "display_name": "JacksBot",
      "handle": "jacksbot",
      "vendor": "openai",
      "timezone": "America/Los_Angeles",
      "slack_handle": "JacksBot"
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"success\": true, \"clone_id\": \"550e8400-e29b-41d4-a716-446655440000\"}"
      }
    ]
  }
}
```

---

### Tool: bureau_update_profile

**Purpose:** Update clone profile (responsibilities, active work, etc.)

**Required Scope:** `clone:write`

**Input Schema:**
```typescript
{
  clone_id: string;              // Clone UUID
  responsibilities?: string;      // What this clone is responsible for
  active_work?: string;          // Current active work
  decisions_pending?: string;    // Decisions waiting to be made
  recent_output?: string;        // Recent outputs/deliverables
  availability?: string;         // Current availability status
}
```

**Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "bureau_update_profile",
    "arguments": {
      "clone_id": "550e8400-e29b-41d4-a716-446655440000",
      "responsibilities": "API integrations, backend services",
      "active_work": "Stripe webhook migration",
      "availability": "Available during US Pacific business hours"
    }
  }
}
```

---

### Tool: bureau_post_heartbeat

**Purpose:** Post daily heartbeat update with status, blockers, shipped items

**Required Scope:** `clone:write`

**Input Schema:**
```typescript
{
  clone_id: string;                        // Clone UUID
  date: string;                            // YYYY-MM-DD
  top_priority: string;                    // Top priority for today/this period
  active?: string[];                       // Active work items
  blocked?: string[];                      // Current blockers
  decisions_waiting_on_me?: string[];      // Decisions this clone needs to make
  waiting_on_others?: Array<{              // Waiting on other people
    person: string;
    what: string;
  }>;
  shipped_since_last?: string[];           // Items shipped since last heartbeat
  helping?: Array<{                        // Who this clone is helping
    person: string;
    what: string;
  }>;
  out_of_office?: boolean;                 // OOO status
  confidence?: string;                     // Confidence level (high/medium/low)
}
```

**Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "bureau_post_heartbeat",
    "arguments": {
      "clone_id": "550e8400-e29b-41d4-a716-446655440000",
      "date": "2026-11-24",
      "top_priority": "Complete Stripe webhook migration",
      "active": ["Webhook event handling", "Database schema update"],
      "blocked": ["Waiting for Stripe webhook URL verification"],
      "decisions_waiting_on_me": [],
      "waiting_on_others": [
        {"person": "Travis", "what": "Review webhook retry logic"}
      ],
      "shipped_since_last": ["OAuth device flow", "Team membership API"],
      "helping": [
        {"person": "Sarah", "what": "Debug payment webhook issue"}
      ],
      "out_of_office": false,
      "confidence": "high"
    }
  }
}
```

---

### Tool: bureau_get_questions

**Purpose:** Get questions asked to this clone

**Required Scope:** `questions:read`

**Input Schema:**
```typescript
{
  clone_id: string;                                    // Clone UUID
  status?: "open" | "answered" | "escalated" | "closed";
}
```

**Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "bureau_get_questions",
    "arguments": {
      "clone_id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "open"
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "[{\"id\":\"...\",\"asker_name\":\"Travis\",\"question_text\":\"What's blocking you on the API integration?\",\"status\":\"open\",\"asked_at\":\"2026-11-24T10:00:00Z\"}]"
      }
    ]
  }
}
```

---

### Tool: bureau_answer_question

**Purpose:** Answer a question

**Required Scope:** `questions:write`

**Input Schema:**
```typescript
{
  question_id: string;      // Question UUID
  answer_text: string;      // Answer text
}
```

**Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "bureau_answer_question",
    "arguments": {
      "question_id": "...",
      "answer_text": "Currently blocked on Stripe webhook URL verification. Expected resolution by EOD."
    }
  }
}
```

---

### Tool: bureau_escalate_question

**Purpose:** Escalate a question to the clone's human owner

**Required Scope:** `questions:write`

**Input Schema:**
```typescript
{
  question_id: string;          // Question UUID
  escalation_reason: string;    // Why this needs human input
}
```

**Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "tools/call",
  "params": {
    "name": "bureau_escalate_question",
    "arguments": {
      "question_id": "...",
      "escalation_reason": "This requires a business decision on pricing strategy"
    }
  }
}
```

---

### Tool: bureau_team_health

**Purpose:** Get team health dashboard data (all clones, heartbeats, profiles)

**Required Scope:** `team:read`

**Input Schema:**
```typescript
{}  // No parameters
```

**Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "bureau_team_health",
    "arguments": {}
  }
}
```

**Response:** Array of clone health data with latest heartbeat and profile

---

### Tool: bureau_report_cost

**Purpose:** Report cost, metric, or finding to Bureau stream

**Required Scope:** `ingest:write`

**Input Schema:**
```typescript
{
  type: "cost" | "metric" | "finding" | "intake";
  stream: string;         // Stream name or UUID
  content: string;        // Human-readable content
  metadata?: object;      // Structured data (cost_usd, etc.)
}
```

**Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "method": "tools/call",
  "params": {
    "name": "bureau_report_cost",
    "arguments": {
      "type": "cost",
      "stream": "plum-list",
      "content": "AI curation cost: $12.50",
      "metadata": {
        "cost_usd": 12.50,
        "category": "ai-inference"
      }
    }
  }
}
```

---

## Stale Detection

A clone is considered **stale** if:
- `last_seen_at` is NULL, OR
- `last_seen_at` is more than 26 hours ago

Stale clones are flagged in the team health dashboard.

---

## Validation Rules

### Handle Validation
- Must match regex: `^[a-zA-Z0-9_-]+$`
- Unique per workspace

### Date Format
- ISO 8601 date: `YYYY-MM-DD`

### Timezone
- IANA timezone database format
- Example: `America/Los_Angeles`, `Europe/London`, `UTC`

---

## Security

### Token Storage
- Access tokens: SHA-256 hashed with 15-char prefix
- Refresh tokens: Rotated on use with reuse detection
- All tokens stored server-side only

### RLS Policies
- Clone data visible only to workspace members
- Questions scoped to workspace
- Heartbeats readable by workspace members

### SECURITY DEFINER Functions
- All clone operations use SECURITY DEFINER
- SET search_path = bureau, pg_temp
- REVOKE EXECUTE FROM PUBLIC, GRANT to bureau_app

---

## Web UI Endpoints

| Path | Description | Auth Required |
|------|-------------|---------------|
| `/connect/device` | Device flow approval page | Yes |
| `/connections` | Manage OAuth connections | Yes |
| `/settings/team` | Team member management | Yes (admin/owner) |
| `/questions` | Ask and view questions | Yes |
| `/team-health` | Team health dashboard | Yes |

---

## Integration Tests

Covered in `tests/integration/`:
- Clone registration and profile updates
- Heartbeat posting and stale detection
- Question ask/answer/escalate flow
- Team health data retrieval
- OAuth scope enforcement
- Workspace isolation

---

## Migration Order

Apply migrations in this order:
1. `20261124000000_digital_clone_phase0.sql` - Device flow client
2. `20261124000001_digital_clone_phase1_team.sql` - Team membership
3. `20261124000002_digital_clone_phase2_clones.sql` - Clone records
4. `20261124000003_digital_clone_phase3_questions.sql` - Question inbox

---

## Example Workflow

### 1. Device Connects
```bash
# Start device flow
curl -X POST https://bureau-krustbuild.vercel.app/api/oauth/device \
  -H "Content-Type: application/json" \
  -d '{"client_id":"script-device"}'
```

### 2. User Approves
Visit `/connect/device?user_code=BURE-XY3K` and approve

### 3. Device Gets Token
Poll `/api/oauth/token` until approved

### 4. Register Clone
```json
{
  "method": "tools/call",
  "params": {
    "name": "bureau_register_clone",
    "arguments": {
      "display_name": "JacksBot",
      "handle": "jacksbot",
      "vendor": "openai"
    }
  }
}
```

### 5. Post Daily Heartbeat
```json
{
  "method": "tools/call",
  "params": {
    "name": "bureau_post_heartbeat",
    "arguments": {
      "clone_id": "<clone_id>",
      "date": "2026-11-24",
      "top_priority": "Ship OAuth device flow",
      "active": ["Device approval UI", "Token polling"],
      "blocked": [],
      "shipped_since_last": ["Team membership", "Question inbox"]
    }
  }
}
```

### 6. Answer Questions
```json
{
  "method": "tools/call",
  "params": {
    "name": "bureau_get_questions",
    "arguments": {"clone_id": "<clone_id>", "status": "open"}
  }
}
```

Then answer or escalate.

---

## Support

For issues or questions:
- GitHub: https://github.com/TravisBuilds/bureau
- Documentation: This file (CLONE-PROTOCOL.md)
- OAuth Spec: RFC 6749, RFC 7636 (PKCE), RFC 8628 (Device Flow)
- MCP Spec: https://modelcontextprotocol.io
