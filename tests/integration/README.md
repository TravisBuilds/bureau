# Integration Tests

## Setup

Integration tests require a PostgreSQL database. Use Docker Compose:

```bash
# Start test database
docker-compose -f docker-compose.test.yml up -d

# Wait for ready
sleep 10

# Run tests
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/bureau_test npx vitest run tests/integration

# Stop database
docker-compose -f docker-compose.test.yml down
```

Or use the npm script:

```bash
npm run test:integration
```

## What Tests Cover

1. **Token Creation with Hash Storage**
   - Creates token with SHA-256 hash
   - Verifies resolve_ingest_token works
   - Tests hash comparison

2. **Auto-Create Stream from Ingest**
   - Creates token for workspace
   - Auto-creates stream with category='production'
   - Verifies stream count incremented

3. **Stream Limit Enforcement**
   - Creates 50 streams
   - Verifies limit enforced (429 error on 51st)

4. **Workspace Isolation**
   - Creates two users with separate workspaces
   - Each creates streams
   - Verifies RLS: User1 cannot see User2 data

5. **Per-Stream Cost Aggregation**
   - Creates 2 streams
   - Logs different costs to each
   - Queries verify correct per-stream totals
   - Validates top-floor aggregation query

## Expected Output

```
✓ tests/integration/routes.test.ts (5)
  ✓ Integration Tests (5)
    ✓ should create token with hash storage
    ✓ should auto-create stream from ingest
    ✓ should enforce stream limit (50 max)
    ✓ should isolate workspaces (user1 cannot see user2 data)
    ✓ should aggregate per-stream costs correctly

Test Files  1 passed (1)
     Tests  5 passed (5)
  Start at  HH:MM:SS
  Duration  ~10s
```

## Notes

- Tests run as `bureau_app` role with RLS enabled
- All migrations applied in order
- Each test uses `withUser()` for proper JWT claims
- Database cleaned up after tests
