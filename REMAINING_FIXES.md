# Remaining Fixes

## ✅ Migrations Fixed
- Phase 0: Device flow client seeded
- Phase 1: ALTER TYPE ADD VALUE, active member checks, reactivation, token revocation
- Phase 2: Removed GENERATED is_stale, added owner checks, workspace isolation
- Phase 3: Fixed param order, added workspace/owner checks
- All: REVOKE/GRANT, search_path = bureau, pg_temp

All migrations apply cleanly to local Postgres.

## ❌ Code Fixes Still Needed

### 1. Fix user_workspaces() function
Location: 20261122000003_fix_rls_circular_dependency.sql or similar
Issue: Must exclude removed_at IS NOT NULL

### 2. Fix MCP Tool Calls (app/api/mcp/route.ts)
All tools (~lines 551, 610, 719, 775, 831) need:
- Get workspace_id and user_id from cred (resolve_credential result)
- Pass to SQL functions as first 2 params
- bureau_register_clone($1=workspace_id, $2=user_id, $3=agent_link_id, ...)
- bureau_update_profile($1=workspace_id, $2=user_id, $3=clone_id, ...)
- bureau_post_heartbeat($1=workspace_id, $2=user_id, $3=clone_id, ...)
- bureau_get_questions($1=workspace_id, $2=user_id, $3=clone_id, ...)
- bureau_answer_question($1=workspace_id, $2=user_id, $3=question_id, ...)
- bureau_escalate_question($1=workspace_id, $2=user_id, $3=question_id, ...)

### 3. Fix API Routes (Remove auth.users joins)
Files:
- app/api/team/members/route.ts (joins auth.users)
- app/api/questions/route.ts (joins auth.users)  
- app/api/clones/route.ts (joins auth.users)

Fix: Use workspace_members.email instead, or run queries via withUser pattern

### 4. Consolidate /mcp and /api/mcp
- app/mcp/route.ts is a stale copy
- Create shared lib/mcp-handler.ts
- Implement full MCP protocol per spec

### 5. Implement Full MCP Protocol
Missing methods:
- initialize (protocolVersion, capabilities, serverInfo)
- notifications/initialized (202 no body)
- ping (health check)
Existing tools/list and tools/call need MCP envelope

### 6. Fix Slack Integration (app/api/slack/events/route.ts)
- Add slack_installations table (workspace_id, team_id)
- Lookup workspace by team_id
- Handle X-Slack-Retry-Num (200 ignore)
- Dedupe event_id
- Fix timingSafeEqual length mismatch
- Reject missing/NaN timestamp
- Fix .replace(/ask/i) parsing

### 7. Fix /api/ingest Enforcement
Enforce from resolve_credential:
- allowed_stream_ids (OAuth tokens)
- allow_create_streams flag
- scopes check

### 8. Add RLS Policies for Writes
Tables needing INSERT/UPDATE policies:
- digital_clones
- clone_profiles
- clone_heartbeats
- questions

Or route all writes through SECURITY DEFINER functions.

### 9. Validate OAuth Scopes
In /api/oauth/authorize and /api/oauth/device:
- Check requested scopes against allowlist
- ['ingest:write', 'clone:write', 'questions:read', 'questions:write', 'team:read']

### 10. Write Integration Tests
Tests needed (run as bureau_app):
- Cross-workspace isolation (every MCP tool, every API route)
- Clone takeover blocked
- Outsider can't invite/remove
- Removed member loses access (RLS + tokens)
- Stale computation
- MCP handshake
- Slack signature verification
- Ingest stream restriction

## Priority Order
1. Fix user_workspaces (blocks RLS)
2. Fix MCP tool calls (security critical)
3. Fix API routes (no auth.users)
4. Write basic integration tests
5. Fix /api/ingest enforcement
6. Consolidate MCP handlers
7. Fix Slack integration
8. Implement full MCP protocol
9. Add write RLS policies
10. Validate OAuth scopes
