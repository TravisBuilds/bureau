#!/bin/bash
set -e

echo "=== Creating fresh database ==="
sudo -u postgres dropdb --if-exists bureau_test_final
sudo -u postgres createdb bureau_test_final

echo "=== Applying test setup ==="
sudo -u postgres psql -d bureau_test_final -f tests/setup-test-db.sql

echo "=== Applying migrations one by one ==="
for f in supabase/migrations/*.sql; do
  echo ""
  echo ">>> Applying: $f"
  sudo -u postgres psql -d bureau_test_final -v ON_ERROR_STOP=1 --single-transaction -f "$f"
  echo "✓ Success: $f"
done

echo ""
echo "=== ALL MIGRATIONS APPLIED SUCCESSFULLY ==="
