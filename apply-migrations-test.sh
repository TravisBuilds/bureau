#!/bin/bash
set -e

# Fresh database
sudo -u postgres dropdb --if-exists bureau_test_fresh
sudo -u postgres createdb bureau_test_fresh

# Apply test setup
sudo -u postgres psql -d bureau_test_fresh -f tests/setup-test-db.sql

# Apply all migrations in order with single-transaction
for f in supabase/migrations/*.sql; do
  echo "Applying $f..."
  sudo -u postgres psql -d bureau_test_fresh -v ON_ERROR_STOP=1 --single-transaction -f "$f"
done

echo "✓ All migrations applied successfully"
