#!/usr/bin/env bash
# Starts the local test database for the pre-push check when it is not running,
# then applies any missing migrations. Use it when the database is a local
# PostgreSQL install rather than the Docker Compose service (which the check
# starts by itself). Safe to run again: it does nothing when the database is up.
#
# Settings (environment variables, with defaults):
#   PARMANA_TEST_DB_PORT   port to listen on              (default 54329)
#   PARMANA_TEST_DB_DATA   data directory                 (required; no default)
#   PARMANA_TEST_DB_USER   the Postgres user the tests use (default parmana)
#   PARMANA_TEST_DB_PASS   that user's password           (default parmana-local)
#   PARMANA_TEST_DB_NAME   database name                  (default parmana)
#   PG_BIN                 PostgreSQL bin directory       (default /usr/lib/postgresql/16/bin)
#   PG_OS_USER             user that owns the server      (default postgres)
#
# The server must not run as root, so it is started as PG_OS_USER.

set -euo pipefail

PORT="${PARMANA_TEST_DB_PORT:-54329}"
DATA="${PARMANA_TEST_DB_DATA:?set PARMANA_TEST_DB_DATA to the data directory}"
DB_USER="${PARMANA_TEST_DB_USER:-parmana}"
DB_PASS="${PARMANA_TEST_DB_PASS:-parmana-local}"
DB_NAME="${PARMANA_TEST_DB_NAME:-parmana}"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PG_OS_USER="${PG_OS_USER:-postgres}"
RUN_DIR="$DATA/../run"

listening() {
  (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null
}

if listening; then
  echo "start-test-db: a database already listens on 127.0.0.1:$PORT."
else
  if [ ! -d "$DATA" ]; then
    echo "start-test-db: $DATA does not exist. Run initdb first (see CONTRIBUTING.md)." >&2
    exit 1
  fi
  mkdir -p "$RUN_DIR"
  chown "$PG_OS_USER" "$RUN_DIR" 2>/dev/null || true
  rm -f "$DATA/postmaster.pid"
  if [ "$(id -u)" -eq 0 ]; then
    runuser -u "$PG_OS_USER" -- "$PG_BIN/pg_ctl" -D "$DATA" \
      -o "-p $PORT -k $RUN_DIR -c listen_addresses=127.0.0.1" -l "$DATA/../pg.log" -w start
  else
    "$PG_BIN/pg_ctl" -D "$DATA" \
      -o "-p $PORT -k $RUN_DIR -c listen_addresses=127.0.0.1" -l "$DATA/../pg.log" -w start
  fi
fi

# Create the database if it is missing. Uses the same user the tests use.
if ! PGPASSWORD="$DB_PASS" "$PG_BIN/psql" -h 127.0.0.1 -p "$PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "select 1" >/dev/null 2>&1; then
  PGPASSWORD="$DB_PASS" "$PG_BIN/psql" -h 127.0.0.1 -p "$PORT" -U "$DB_USER" -d postgres -c "create database $DB_NAME" >/dev/null
  echo "start-test-db: created database $DB_NAME."
fi

# Apply migrations. The migrate script records each one once, so this is safe to repeat.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DATABASE_URL="postgresql://$DB_USER:$DB_PASS@127.0.0.1:$PORT/$DB_NAME" \
  node "$ROOT/node_modules/.bin/tsx" "$ROOT/scripts/migrate-database.ts" apply

echo "start-test-db: ready on 127.0.0.1:$PORT."
