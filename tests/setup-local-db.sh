#!/bin/bash
# Setup local Postgres for testing
# Run this script to initialize bureau_test database

set -e

DB_NAME="bureau_test"
POSTGRES_USER="postgres"
APP_USER="bureau_app"
APP_PASSWORD="bureau_app_password"

echo "Setting up local Postgres test database..."

# Create database if it doesn't exist
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME;"

# Create bureau_app role if it doesn't exist
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname = '$APP_USER'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE ROLE $APP_USER WITH LOGIN PASSWORD '$APP_PASSWORD';"

# Apply all migrations in order
echo "Applying migrations..."
for migration in supabase/migrations/*.sql; do
  echo "  Applying: $migration"
  sudo -u postgres psql -d $DB_NAME -f "$migration" -v ON_ERROR_STOP=1
done

echo "✓ Database $DB_NAME is ready for tests"
echo "  Connection: postgresql://$APP_USER:$APP_PASSWORD@localhost:5432/$DB_NAME"
