#!/usr/bin/env bash
#
# Applies the database migrations for the self hosted deployment
# (docker-compose.yml, service `migrate`). Runs in the postgres:16 image.
#
# 1. Creates the roles Supabase provides and plain Postgres does not
#    (postgres-roles.sql, G-58).
# 2. Applies every file in supabase/migrations/ in filename order, each one
#    exactly once, in its own transaction, and records it in
#    parmana_schema_migrations.
#
# Why not scripts/apply-all-migrations.sql: that bundle applies every
# migration again on every run. On a database that already holds data, an older
# migration adds back an older CHECK constraint over rows written under a newer
# one, and the run fails (seen on 2026-09-25 with caller_audit_events). A
# migration that fails leaves nothing behind, because its transaction rolls
# back, and the API does not start.

set -euo pipefail

export PGHOST="${PGHOST:-postgres}"
export PGUSER="${PGUSER:-parmana}"
export PGDATABASE="${PGDATABASE:-parmana}"

MIGRATIONS_DIR="${MIGRATIONS_DIR:-/migrations/supabase}"

psql_quiet() {
  psql --set=ON_ERROR_STOP=1 --quiet --no-psqlrc "$@"
}

psql_quiet --file=/migrations/postgres-roles.sql

psql_quiet --command="
  CREATE TABLE IF NOT EXISTS parmana_schema_migrations (
    name       text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )"

applied=0
skipped=0

for file in "$MIGRATIONS_DIR"/*.sql; do
  name="$(basename "$file")"

  # psql substitutes :'name' (quoted safely) only in input it reads, not in
  # --command, so the statements that use it come in on standard input.
  already="$(printf '%s\n' "SELECT 1 FROM parmana_schema_migrations WHERE name = :'name';" |
    psql_quiet --tuples-only --no-align --set=name="$name")"

  if [ "$already" = "1" ]; then
    skipped=$((skipped + 1))
    continue
  fi

  echo "[migrate] applying $name"
  printf '%s\n' "INSERT INTO parmana_schema_migrations (name) VALUES (:'name');" |
    psql_quiet --single-transaction --set=name="$name" \
      --file="$file" --file=-
  applied=$((applied + 1))
done

echo "[migrate] $applied applied, $skipped already applied"
