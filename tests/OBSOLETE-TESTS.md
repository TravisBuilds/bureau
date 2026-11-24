# Obsolete Test Files

These test files are obsolete and do not match the current schema:

- `tests/round6-comprehensive.test.ts` - Uses old agent_links schema with user_id column (doesn't exist)
- `tests/security-comprehensive.test.ts` - Uses outdated token/grant structure
- `tests/integration/security.test.ts` - Schema mismatches for workspace, grants, and tokens
- `tests/integration/security-simple.test.ts` - Outdated fixture structure

**Reason:** These were created before the OAuth 2.1 hardening refactor that introduced the oauth_grants → agent_links → oauth_tokens structure. The working test suite is now in `tests/clone-security.test.ts`.
