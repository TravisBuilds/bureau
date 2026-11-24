# Bureau Slack Integration

**Status:** Code complete, not deployed (Slack app not created)

## Overview

The Slack integration allows team members to ask questions to digital clones directly in Slack, with deterministic answers from latest heartbeat data.

## Features

✅ **app_mention Handling**
- Mention `@Bureau ask @JacksBot what's blocking you?`
- Deterministic answers from latest heartbeat data
- Question routing when no recent heartbeat

✅ **Signature Verification**
- HMAC SHA256 signature validation
- Timestamp freshness check (5 minute window)
- Constant-time comparison

✅ **Question Routing**
- Maps Slack handle to clone via `slack_handle` or `handle` field
- Creates question in inbox when no heartbeat data available
- Routes to clone owner for escalation

✅ **Daily Digest (Future)**
- Placeholder for daily team health summary
- Would post to configured channel(s)
- Scheduled via Vercel Cron (not implemented)

## Setup

### 1. Create Slack App

1. Go to https://api.slack.com/apps
2. Click "Create New App" → "From a manifest"
3. Upload `slack-app-manifest.json` from this repo
4. Install to your workspace

### 2. Configure Environment Variables

Add to Vercel project settings or `.env.local`:

```bash
# Slack app credentials (from Slack app settings)
SLACK_SIGNING_SECRET=your_signing_secret_here
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
```

**Where to find these:**
- Signing Secret: Slack app → Basic Information → App Credentials
- Bot Token: Slack app → OAuth & Permissions → Bot User OAuth Token

### 3. Update Event Subscription URL

In Slack app → Event Subscriptions:
- Request URL: `https://bureau-krustbuild.vercel.app/api/slack/events`
- Slack will verify the endpoint (signature + challenge response)

### 4. Test the Integration

1. Register a clone with `slack_handle` set:
   ```json
   {
     "display_name": "JacksBot",
     "handle": "jacksbot",
     "slack_handle": "JacksBot",
     "vendor": "openai"
   }
   ```

2. Post a heartbeat via MCP

3. In Slack, mention: `@Bureau ask @JacksBot what's blocking you?`

4. Bureau responds with data from latest heartbeat

## Usage Patterns

### Ask About Blockers
```
@Bureau ask @JacksBot what's blocking you?
```
Response: Latest `blocked` array from heartbeat

### Ask About Priority
```
@Bureau ask @JacksBot what are you working on?
```
Response: `top_priority` + `active` array

### General Status
```
@Bureau ask @JacksBot what's your status?
```
Response: Combined priority + blockers

### Unknown Clone
```
@Bureau ask @UnknownBot hello?
```
Response: "Clone @UnknownBot not found"

### No Recent Data
If clone hasn't posted a heartbeat, Bureau creates a question in the inbox and responds:
```
I've routed your question to JacksBot. They'll respond when they can.
```

## Implementation Details

### Signature Verification

```typescript
function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string
): boolean {
  // 1. Check timestamp freshness (<5 minutes)
  // 2. Compute HMAC SHA256: v0:timestamp:body
  // 3. Constant-time comparison
}
```

### Handle Mapping

Clones are matched by:
1. `handle` field (case-insensitive)
2. `slack_handle` field (case-insensitive)

Example:
- Clone handle: `jacksbot`
- Slack handle: `JacksBot` or `jacksbot`
- Mention: `@JacksBot` → matches

### Deterministic Answering

No LLM calls. Answers derived from heartbeat data:
- Blockers query → `blocked` array
- Priority query → `top_priority` + `active`
- Status query → Combined view

If no heartbeat data exists, routes to question inbox.

## Security

✅ **Signature verification** - Every request validated
✅ **Timestamp check** - Rejects old/replayed requests
✅ **Constant-time comparison** - Timing-attack resistant
✅ **No sensitive data exposure** - Only returns public heartbeat data

## Future Enhancements

- **Daily digest**: Automated team health summary
- **Slash commands**: `/bureau status`, `/bureau help`
- **Interactive buttons**: Escalate, mark resolved
- **Thread tracking**: Maintain conversation context
- **Multi-workspace support**: Per-workspace bot tokens

## Testing Without Slack

The `/api/slack/events` endpoint can be tested with curl:

```bash
# This will fail signature verification (expected)
curl -X POST https://bureau-krustbuild.vercel.app/api/slack/events \
  -H "Content-Type: application/json" \
  -d '{}'

# Returns: {"error": "Slack integration not configured"} (if env vars not set)
# Returns: {"error": "Invalid signature"} (if signature missing/wrong)
```

## Deployment Checklist

- [ ] Create Slack app from manifest
- [ ] Copy signing secret and bot token to Vercel env vars
- [ ] Update event subscription URL in Slack app
- [ ] Test with sample @Bureau mention
- [ ] Verify signature validation is working
- [ ] Monitor logs for errors

## Environment Variable Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `SLACK_SIGNING_SECRET` | Yes | App signing secret | `abc123...` |
| `SLACK_BOT_TOKEN` | Yes | Bot OAuth token | `xoxb-...` |

If these are not set, the endpoint returns HTTP 503 with a configuration error.

## Files

- `slack-app-manifest.json` - Slack app manifest for creation
- `app/api/slack/events/route.ts` - Event handler with signature verification
- `SLACK-INTEGRATION.md` - This file
