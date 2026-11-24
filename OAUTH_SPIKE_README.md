# Bureau OAuth 2.1 + MCP Server - Phase 0 Spike

**Status:** Preview spike (branch `cursor/mcp-oauth-spike-f836`)  
**Date:** 2026-11-23  
**Migration:** `20261123170000_oauth_mcp_server.sql` (NOT applied to production)

## What This Spike Implements

This is a **Phase 0 preview** of Bureau as an OAuth 2.1 authorization server + MCP resource server, enabling ChatGPT, Grok Bot, Cursor, and other MCP clients to connect to Bureau with proper OAuth consent and per-agent stream scoping.

### Core Features

✅ **OAuth 2.1 Authorization Server**
- PKCE (S256) mandatory for all flows
- Refresh token rotation with reuse detection (revokes entire family on reuse)
- SHA-256 hashed token storage (never plaintext)
- Exact redirect URI validation (HTTPS or localhost only)
- RFC 8414 authorization server metadata endpoint
- RFC 9728 protected resource metadata endpoint

✅ **MCP Server (Streamable HTTP)**
- `bureau_report_cost` - Report cost/metric/finding into allowed streams
- `bureau_list_streams` - List streams accessible to this agent
- `bureau_whoami` - Get agent link info and scopes
- Bearer token authentication (OAuth access tokens or legacy ingest tokens)

✅ **Per-Agent Stream Scoping**
- Each agent link has an allowlist of stream UUIDs
- `allow_create_streams` flag per agent
- Enforcement at credential resolution (before ingest)
- 50 stream limit per workspace (existing cap)

✅ **Consent Screen**
- User picks agent name, streams, and "allow create" flag
- Shows client name, redirect host, scopes, resource
- Unverified client warning for DCR-registered clients

✅ **Connection Management UI**
- `/connect` - Choose ChatGPT / Grok Bot / Cursor / Other / Device
- `/connect/chatgpt` - Guided setup for ChatGPT custom MCP
- `/connections` - List/revoke connections and agent links
- `/oauth/authorize` - OAuth consent screen (requires Bureau session)

✅ **Legacy Token Compatibility**
- `resolve_credential()` SECURITY DEFINER function routes by prefix
- `bureau_` → legacy ingest token (workspace-wide, all streams)
- `bureau_at_` → OAuth access token (agent-scoped)
- Existing `/api/ingest` unchanged, calls same resolver
- Legacy tokens keep working (no migration needed)

✅ **Device Code Flow (RFC 8628)**
- `/api/oauth/device` - Start device flow, returns `user_code` (e.g. `BURE-XY3K`)
- User enters code at `/connect/device` (not yet built in spike)
- Script polls `/api/oauth/token` with `device_code` until approved

✅ **Static Clients (Seeded)**
- `chatgpt-mcp` - ChatGPT Custom MCP
- `grokbot-mcp` - Grok Bot MCP Connector
- `cursor-mcp` - Cursor MCP

### Security Features

🔒 **Token Hashing**
- All tokens stored as SHA-256 hash + 15-char prefix
- Constant-time comparison (via indexed hash lookup)
- Token prefixes: `bureau_at_` (access), `bureau_rt_` (refresh), `bureau_` (legacy)

🔒 **Refresh Token Rotation**
- Every refresh mints a new refresh token and marks old one `used_at`
- Reuse detection: if `used_at IS NOT NULL`, revoke entire `family_id`
- Grant marked `needs_reauth`, user notified (audit log in future)

🔒 **PKCE Enforcement**
- Only `S256` accepted (reject `plain` or missing)
- Code verifier validated on token exchange
- Authorization codes bound to `code_challenge` + `client_id` + `redirect_uri`

🔒 **RLS + SECURITY DEFINER**
- Secret-bearing tables (`oauth_tokens`, `oauth_codes`, `oauth_device_codes`) have RLS enabled with NO policy for `bureau_app`
- Only accessible via SECURITY DEFINER functions:
  - `resolve_credential(p_token)` - Resolves token to workspace/user/agent_link
  - `mint_oauth_tokens(...)` - Creates access + refresh tokens
  - `rotate_refresh_token(...)` - Handles rotation with reuse detection
- No direct table access from app code

🔒 **Credential Storage**
- **This spike does NOT store vendor credentials** (no OpenAI keys, no Cursor keys)
- Bureau is the authorization server; vendors are OAuth clients
- For future pull connectors (Phase 3), use app-level envelope encryption:
  - Per-row DEK (data encryption key), AES-256-GCM
  - KEK (key encryption key) in `BUREAU_KEK_V1` env var
  - AAD = `workspace_id|connection_id`
  - Never reuse `lib/credential-storage.ts` (filesystem, CBC, hard-coded dev key)

🔒 **Origin Validation**
- CSRF token + `Origin` header check on consent POST
- `frame-ancestors 'none'` on consent screen (no clickjacking)
- Redirect URI exact match (no wildcards)

### Database Schema

New tables in `bureau` schema:

- `oauth_clients` - Client registry (static + DCR)
- `oauth_grants` - User+client+workspace connections (one grant → many agent_links)
- `agent_links` - Per-agent stream allowlists + scopes
- `oauth_tokens` - Access/refresh tokens (hashed, with `family_id` for rotation)
- `oauth_codes` - Authorization codes (60s TTL, single-use)
- `oauth_device_codes` - Device flow codes (10m TTL)
- `agent_seen` - First-seen agent names awaiting linking (optional, not yet wired)

Modified tables:

- `ingest_tokens` - Added `kind` (`legacy` | `agent_link`) + `agent_link_id` nullable

### Endpoints

**OAuth 2.1:**
- `GET /.well-known/oauth-authorization-server` - RFC 8414 metadata
- `GET /.well-known/oauth-protected-resource` - RFC 9728 metadata
- `GET /oauth/authorize?client_id&redirect_uri&state&code_challenge&resource&scope` - Consent screen
- `POST /api/oauth/authorize` - Process consent, mint auth code
- `POST /api/oauth/token` - Exchange code or refresh token
- `POST /api/oauth/revoke` - RFC 7009 revocation
- `POST /api/oauth/device` - RFC 8628 device flow start
- `GET /api/oauth/client?client_id=...` - Client info for consent screen

**MCP:**
- `POST /api/mcp` - MCP server (Streamable HTTP)
  - Methods: `tools/list`, `tools/call`
  - Tools: `bureau_report_cost`, `bureau_list_streams`, `bureau_whoami`

**UI:**
- `/connect` - Connection options (ChatGPT / Grok Bot / Cursor / Other / Device)
- `/connect/chatgpt` - Guided ChatGPT setup (copy URL, waiting status)
- `/connect/grokbot`, `/connect/cursor` - (not built in spike, same pattern)
- `/connections` - List/revoke connections
- `/oauth/authorize` - Consent screen (requires Bureau session)

**Management:**
- `GET /api/connections` - List user's connections + agent_links
- `DELETE /api/connections/[id]` - Revoke connection

### What's NOT in This Spike

❌ Device flow consent UI (`/connect/device?user_code=...`) - endpoint exists, UI pending  
❌ Per-agent MCP URLs (`/mcp/a/<agent_link_id>`) - strict mode for cost attribution  
❌ Agent-seen queue UI - table exists, no auto-link flow  
❌ Reuse-detection alerts / audit log display  
❌ Dynamic Client Registration (DCR) - table supports it, endpoint not built  
❌ CIMD (Client ID Metadata Documents) - static clients only  
❌ Pull connectors (vendor key storage) - out of scope for Phase 0  
❌ Connection to real ChatGPT/Grok Bot/Cursor - no vendor app registrations  
❌ Integration tests against real DB - structure written, needs DB setup

### Testing on Preview

**Prerequisites:**
- Migration `20261123000000_oauth_mcp_server.sql` must be applied to a **test database** (NOT production Supabase)
- Vercel preview build will deploy but **shares production env** (no migration auto-applied)

**How to Test:**

1. **Metadata Endpoints** (no DB needed):
   ```bash
   curl https://bureau-preview.vercel.app/.well-known/oauth-authorization-server
   curl https://bureau-preview.vercel.app/.well-known/oauth-protected-resource
   ```

2. **MCP 401 Challenge** (no token):
   ```bash
   curl -X POST https://bureau-preview.vercel.app/api/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   # Should return 401 with WWW-Authenticate header
   ```

3. **Full OAuth Flow** (requires migration + test user):
   - Sign in to Bureau on preview
   - Visit `/connect/chatgpt`
   - In a local MCP client (e.g. MCP Inspector), configure:
     - Server URL: `https://bureau-preview.vercel.app/mcp`
     - Client ID: `cursor-mcp` (or register a test client)
     - Redirect URI: `http://localhost:8787/callback`
   - Start OAuth flow, approve consent
   - MCP client should receive tokens

4. **Legacy Token Still Works** (if DB has migration):
   ```bash
   # Create a legacy token at /api/tokens, then:
   curl -X POST https://bureau-preview.vercel.app/api/ingest \
     -H "Authorization: Bearer bureau_<your_token>" \
     -H "Content-Type: application/json" \
     -d '{"type":"intake","stream":"test","content":"Hello from legacy token"}'
   ```

### Migration Path to Production

**Before Production Deploy:**

1. ✅ Apply migration to staging/test DB, verify schema
2. ✅ Run integration tests (oauth-flow.test.ts with real DB)
3. ✅ Security review: token hashing, PKCE, rotation, RLS
4. ⚠️ **Decision:** Keep on shared PulseCheck Supabase project, or move Bureau to its own project first?
5. ✅ Set `NEXT_PUBLIC_APP_URL` in production env (for redirect URIs)
6. ✅ Verify middleware allows new endpoints
7. ✅ Test one full OAuth flow on staging (Cursor MCP client recommended)
8. ✅ Merge to `main` after approval

**Post-Deploy:**

- Monitor `oauth_grants`, `oauth_tokens` for activity
- Check for refresh token reuse attempts (audit log)
- Verify legacy tokens still work
- Test connection revocation from `/connections`

### Open Questions for Travis

1. **Shared DB:** OK to add 8 OAuth tables to PulseCheck's Supabase project, or move Bureau to its own project first?
2. **ChatGPT Plan Coverage:** Pilots on ChatGPT Plus/Pro may hit read-only MCP limits. Document "Business/Enterprise only" or offer legacy tokens as fallback?
3. **Vendor App Registration:** This spike has NOT registered Bureau with OpenAI, X (Grok), or Cursor. Try it in your own account first?
4. **Legacy Token Sunset:** Keep indefinitely as "advanced", or sunset after N weeks?
5. **Device Flow UI:** Build `/connect/device` consent screen, or defer to Phase 1?
6. **Pull Connectors:** Revisit encrypted vendor key storage in Phase 3, or never (push-only Bureau)?

### Files Changed

**New Files:**
- `supabase/migrations/20261123000000_oauth_mcp_server.sql` - Schema
- `lib/oauth-server.ts` - OAuth helpers (token gen, PKCE, rotation)
- `app/api/oauth/authorize/route.ts` - Consent processor
- `app/api/oauth/token/route.ts` - Token endpoint
- `app/api/oauth/revoke/route.ts` - Revocation
- `app/api/oauth/client/route.ts` - Client lookup
- `app/api/oauth/device/route.ts` - Device flow start
- `app/.well-known/oauth-authorization-server/route.ts` - RFC 8414 metadata
- `app/.well-known/oauth-protected-resource/route.ts` - RFC 9728 metadata
- `app/api/mcp/route.ts` - MCP server
- `app/oauth/authorize/page.tsx` - Consent screen
- `app/connect/page.tsx` - Connection options
- `app/connect/chatgpt/page.tsx` - ChatGPT setup guide
- `app/connections/page.tsx` - Connection management
- `app/api/connections/route.ts` - List connections API
- `app/api/connections/[id]/route.ts` - Revoke connection API
- `tests/oauth-flow.test.ts` - Test suite (structure)
- `OAUTH_SPIKE_README.md` - This file

**Modified Files:**
- `middleware.ts` - Added `/api/oauth/*`, `/api/mcp`, `/.well-known/*` to public paths
- (Did NOT modify `lib/credential-storage.ts` - kept unsafe for comparison)
- (Did NOT touch `/api/tokens` - left String(error) leak for Travis to fix separately)

### How to Connect from ChatGPT (Once Deployed)

1. Sign in to Bureau at `bureau.build`
2. Go to Settings → Connections → "Connect ChatGPT"
3. Copy the Bureau MCP URL: `https://bureau-krustbuild.vercel.app/mcp`
4. In ChatGPT:
   - Settings → Beta Features → Custom MCP Servers
   - Add Custom Server
   - Paste `https://bureau-krustbuild.vercel.app/mcp`
   - ChatGPT redirects to Bureau consent screen
5. On Bureau consent screen:
   - Enter agent name (e.g. "My ChatGPT Assistant")
   - Select allowed streams
   - Click "Authorize"
6. ChatGPT receives tokens and can now call `bureau_report_cost`, `bureau_list_streams`

### Revocation

From `/connections`:
- **Revoke connection** → all agent_links + tokens revoked, grant status = `revoked`
- **Unlink single agent** → that agent_link revoked, tokens still valid for other agents on same grant

Vendor-side: If user removes Bureau connector in ChatGPT/Grok Bot/Cursor, Bureau gets NO webhook. Mitigation: show `last_seen_at`, auto-expire inactive refresh tokens after N days.

### Next Steps (Phase 1)

If Travis approves:

1. Build remaining connection guides (`/connect/grokbot`, `/connect/cursor`, `/connect/device`)
2. Write full integration tests with real DB
3. Implement agent-seen queue + one-click linking UI
4. Add audit log display (reuse-detected, revocations)
5. Build per-agent MCP URLs (`/mcp/a/<agent_link_id>`) for strict mode
6. Implement DCR endpoint (`POST /api/oauth/register`) with rate limiting
7. Add CIMD support (resolve client by metadata doc URL)
8. Test with real ChatGPT/Grok Bot/Cursor accounts
9. Security review + penetration test
10. Apply migration to production, deploy

### Known Issues / Shortcuts in Spike

- `/connect/chatgpt` polling is UI-only (no real polling endpoint)
- Device flow consent UI (`/connect/device`) not built
- No automatic cleanup of expired codes/tokens (would be Vercel Cron)
- Agent-seen table exists but no auto-link flow
- No audit log display for reuse-detected events
- No "quiet connection" warnings (last_seen_at > 7 days)
- No rate limiting on `/api/oauth/register` (DCR not built)
- No CIMD support (static clients only)
- Tests are structure-only (need real DB to run)

---

**Ready for Review:** Travis, this spike is on branch `cursor/mcp-oauth-spike-f836`. PR will be opened with this README. Migration is NOT applied to production. What's your verdict?
