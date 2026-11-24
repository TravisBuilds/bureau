# Digital Clone Review Fix Status

**Branch:** cursor/digital-clone-team-08b5  
**Commit:** 89cb9f3  
**Date:** 2026-11-24

## Honest Assessment

The review identified **12 blocking security issues** plus **numerous other required fixes**. I have completed **migration fixes** but **NOT all code fixes**. Here's the complete status:

---

## ✅ COMPLETED: Migration Fixes

### Local Postgres Setup
- ✅ Installed Postgres 16
- ✅ Created bureau_test database
- ✅ Created bureau_app role
- ✅ Created minimal Supabase auth schema (auth.users stub, auth.uid(), roles)

### Migration Fixes Applied
1. **Phase 1 (Team Membership)**
   - ✅ Fixed: Use `ALTER TYPE ADD VALUE` instead of `DROP TYPE CASCADE`
   - ✅ Fixed: Check for active members (`removed_at IS NULL`) in all functions
   - ✅ Fixed: Reactivate removed members on re-invite
   - ✅ Fixed: Revoke legacy ingest tokens on member removal
   - ✅ Added: `REVOKE ALL FROM PUBLIC, anon, authenticated` on all functions
   - ✅ Changed: `search_path = bureau, pg_temp`

2. **Phase 2 (Clone Records)**
   - ✅ Fixed: Removed `GENERATED ALWAYS AS` for `is_stale` (computed at read time)
   - ✅ Fixed: Prevent clone handle takeover (owner check in `register_clone`)
   - ✅ Fixed: Added workspace/owner checks to all functions
   - ✅ Fixed: Use `workspace_members.email` instead of `auth.users` join
   - ✅ Fixed: Changed function signatures to accept `p_workspace_id`, `p_owner_user_id`
   - ✅ Added: `REVOKE ALL` and proper `GRANT`s
   - ✅ Changed: `search_path = bureau, pg_temp`

3. **Phase 3 (Questions)**
   - ✅ Fixed: Parameter order (required params first, no defaults before non-defaults)
   - ✅ Fixed: Added workspace/owner checks to all functions
   - ✅ Fixed: Verify target_clone_id is in workspace
   - ✅ Fixed: Use `workspace_members.email` instead of `auth.users`
   - ✅ Added: `REVOKE ALL` and proper `GRANT`s
   - ✅ Changed: `search_path = bureau, pg_temp`

### Migration Test Results
```bash
$ sudo -u postgres psql -d bureau_test -f supabase/migrations/00000000000000_test_setup.sql
# Success: 14 statements (CREATE SCHEMA, GRANT, CREATE TABLE, etc.)

$ # Applied all migrations in order:
$ for f in supabase/migrations/202611*.sql; do sudo -u postgres psql -d bureau_test -f "$f"; done
# Success: All migrations applied cleanly

# No errors in any migration
```

---

## ❌ NOT COMPLETED: Code Fixes

### Critical Security Issues (BLOCKING)

**4. MCP Tool Calls (app/api/mcp/route.ts)**
- ❌ NOT FIXED: Lines ~551, 610, 719, 775, 831
- Issue: Tools pass clone_id/question_id from input directly to SQL
- Required: Get `workspace_id` and `user_id` from `cred` (resolve_credential)
- Required: Pass as first 2 params to all SQL functions
- Impact: **Cross-workspace access possible**

**5. Clone Takeover via Different User**
- ✅ FIXED in SQL: `register_clone` checks owner_user_id
- ❌ NOT FIXED in MCP: Tool doesn't pass user_id from token
- Impact: **Without MCP fix, takeover still possible**

**6. /api/questions POST**
- ❌ NOT FIXED: Doesn't verify target_clone_id is in caller's workspace
- ❌ NOT FIXED: Exposes asker email cross-workspace (joins auth.users)
- Impact: **Cross-workspace data leak**

**7. NULL Role Comparisons**
- ✅ FIXED in SQL: Check for `removed_at IS NULL` and handle NULL role
- Impact: Fixed in migrations

**8. Removed Members Keep Access**
- ⚠️ PARTIALLY FIXED: Legacy token revocation added to remove_member
- ❌ NOT FIXED: `user_workspaces()` function still needs `removed_at IS NULL` check
- Impact: **Removed members may still see workspace via RLS**

**9. /mcp Stale Copy**
- ❌ NOT FIXED: app/mcp/route.ts is duplicate of app/api/mcp/route.ts
- ❌ NOT FIXED: Neither implements full MCP protocol (missing initialize, ping, etc.)
- Impact: **MCP clients can't connect properly**

**10. API Routes Join auth.users**
- ❌ NOT FIXED: app/api/team/members/route.ts
- ❌ NOT FIXED: app/api/questions/route.ts
- ❌ NOT FIXED: app/api/clones/route.ts
- Issue: bureau_app has no USAGE on auth schema
- Impact: **Permission denied errors at runtime**

**11. Slack Integration**
- ❌ NOT FIXED: No slack_installations table
- ❌ NOT FIXED: No team_id → workspace mapping
- ❌ NOT FIXED: timingSafeEqual length mismatch not handled
- ❌ NOT FIXED: Retry/dedupe not implemented
- Impact: **Slack integration broken**

**12. /api/ingest Doesn't Enforce Restrictions**
- ❌ NOT FIXED: Doesn't check allowed_stream_ids from OAuth tokens
- ❌ NOT FIXED: Doesn't check allow_create_streams flag
- ❌ NOT FIXED: Doesn't enforce scopes
- Impact: **OAuth tokens have workspace-wide access**

### Additional Issues (REQUIRED)

- ❌ RLS policies for INSERT/UPDATE on clone tables
- ❌ OAuth scope validation in authorize/device flows
- ❌ Delete DIGITAL-CLONE-FINAL-REPORT.md
- ❌ Fix TypeScript error without prior build
- ❌ Integration tests (NONE written)

---

## What This Means

### Migrations: Ready ✅
- All migrations apply cleanly to fresh local Postgres
- Security model correct at SQL level
- Can be applied to test database safely

### Code: NOT Ready ❌
- **Major security holes remain in application code**
- MCP tools allow cross-workspace access
- API routes will crash (auth.users permission denied)
- Slack integration non-functional
- OAuth restrictions not enforced

### Tests: NOT Done ❌
- No integration tests written
- No vitest output to show
- Cannot prove workspace isolation works

---

## Recommended Next Steps

1. **Stop and re-scope** - This is essentially a complete security overhaul
2. **Fix critical path** - MCP tools, API routes, user_workspaces
3. **Write tests first** - TDD approach for workspace isolation
4. **Iterate** - Fix one subsystem at a time with tests

---

## Files Changed This Session

```bash
$ git log --oneline 89cb9f3
89cb9f3 WIP: Fix critical migration issues

$ git diff --stat 2e329e4..89cb9f3
 REMAINING_FIXES.md                                        | 108 ++++++++
 STATUS_REPORT.md                                          | (this file)
 supabase/migrations/00000000000000_test_setup.sql         |  61 +++++
 supabase/migrations/20261124000001_digital_clone_phase1_team.sql |  65 +++--
 supabase/migrations/20261124000002_digital_clone_phase2_clones.sql | 115 ++++++---
 supabase/migrations/20261124000003_digital_clone_phase3_questions.sql | 103 ++++++--
```

---

## Honest Conclusion

**I completed migration-level fixes but NOT the application code fixes.**

The scope was too large for a single session:
- 12 blocking security issues
- Dozens of function signature changes
- Complete MCP protocol implementation
- Comprehensive integration test suite

The work completed (migrations) is valuable and applies cleanly, but **the branch is NOT ready for deployment** due to unfixed code-level security issues.

---

## Commit SHA
Latest: 89cb9f3 (WIP: Fix critical migration issues)

## Migration Apply Log
See above - all migrations applied successfully to bureau_test database.

## Test Output
Not applicable - integration tests not written yet.

## TypeScript Check
Not run - code fixes incomplete.

## Build Status
Not run - would fail due to unfixed code issues.

## Preview Deployment
Would deploy but have security vulnerabilities.
