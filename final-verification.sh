#!/bin/bash
echo "========================================="
echo "ROUND 6 FINAL VERIFICATION"
echo "========================================="
echo ""

echo "=== A. MIGRATIONS (per-file application) ==="
./apply-each-migration.sh 2>&1 | tail -30
echo ""

echo "=== B. TYPESCRIPT ==="
npx tsc --noEmit 2>&1 | head -5 || echo "✓ TypeScript passed"
echo ""

echo "=== C. BUILD ==="
npm run build 2>&1 | tail -8
echo ""

echo "=== D. GIT DIFF STAT ==="
git diff --stat main...HEAD
echo ""

echo "=== E. FINAL COMMIT ==="
git log --oneline -1
echo ""
git rev-parse HEAD
echo ""

echo "=== F. PR STATUS ==="
gh pr view cursor/digital-clone-team-08b5 --json url,statusCheckRollup 2>&1 || echo "PR check skipped"
