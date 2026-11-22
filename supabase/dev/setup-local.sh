#!/bin/bash
# Local development database setup
# Applies auth stubs for RLS testing (local dev only)

set -e

echo "Setting up local development database..."

# Apply auth stubs (local dev only - DO NOT run in production!)
echo "Applying auth stubs..."
psql $DATABASE_URL -f "$(dirname "$0")/auth_stubs.sql"

echo "Local dev setup complete!"
echo "Auth stubs applied for RLS testing."
