#!/usr/bin/env bash
set -e

export PGHOST="0.0.0.0"
export PGPORT="5433"
export PGDATABASE="bot_app_test"
export PGUSERNAME="postgres"
export PGPASSWORD="postgres"
export DATABASE_URL="postgres://postgres:postgres@0.0.0.0:5433/bot_app_test"
export ADMIN_ID="100"
export GEMINI_KEY="test-gemini-key"
export TELEGRAM_TOKEN="test-token"

cleanup() {
    echo "Shutting down test container..."
    bun run shutdown-local-postgres >/dev/null 2>&1 || true
}

trap cleanup EXIT SIGINT SIGTERM

echo "Removing stale container if present..."
bun run shutdown-local-postgres >/dev/null 2>&1 || true

echo "Starting test PostgreSQL container..."
bun run setup-local-postgres >/dev/null

check_database() {
    PGPASSWORD=postgres psql -h 0.0.0.0 -p "5433" -U postgres -d postgres -c "SELECT 1;" >/dev/null 2>&1
}

echo "Waiting for PostgreSQL to be ready..."
until check_database; do
    echo "  Not ready yet, retrying in 1s..."
    sleep 1
done
echo "PostgreSQL is ready."

echo "Running migrations..."
bun run ./src/db/migrate.ts

echo "Running tests..."
bun test tests/ "$@"
