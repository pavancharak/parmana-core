#!/usr/bin/env bash
#
# Deployment drill: runs the real API server against a real Postgres and
# injects two faults. It is run in CI (.github/workflows/outage-drill.yml)
# and can be run by hand against any throwaway Postgres.
#
#   1. Network cut between the API and the database, through a TCP proxy.
#      The process must stay up, and /execute must not return success or
#      a domain decision during the cut. Recovery must follow the heal.
#   2. Signing key missing at startup. The server must refuse to start,
#      exit with code 1, and never listen.
#
# Scope: only refusal paths are exercised. An approved execution needs a
# trusted approver, which this drill does not set up. The fault-injection
# suite in packages/api/tests covers the release path with in-memory stores.
#
# Requirements: Node 24, a built workspace (npm ci && npm run build), psql,
# and a Postgres that PGHOST/PGPORT/PGUSER/PGPASSWORD point at. The
# database must hold nothing that matters: the drill applies migrations.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

WORK="$(mktemp -d)"
PROXY_LISTEN=55433
PROXY_CONTROL=55499
API_PORT=3900
API_KEY="$(openssl rand -hex 32)"
API_KEY_HASH="$(printf %s "$API_KEY" | sha256sum | cut -d' ' -f1)"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-postgres}"
export PGHOST PGPORT PGUSER PGPASSWORD

PROXY_PID=""
SERVER_PID=""

cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  [ -n "$PROXY_PID" ] && kill "$PROXY_PID" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

step() { echo; echo "== $*"; }
fail() { echo "DRILL FAILED: $*" >&2; exit 1; }

# Runs the API against the proxied database. One node process, so the pid
# we hold is the server itself and its exit code is the server's.
start_server() {
  cd "$ROOT/packages/api"
  env \
    NODE_ENV=development \
    PARMANA_STORAGE=postgres \
    DATABASE_URL="postgresql://$PGUSER:$PGPASSWORD@127.0.0.1:$PROXY_LISTEN/postgres" \
    PARMANA_KEY_DIR="$WORK/keys" \
    PARMANA_POLICY_DIR="$ROOT/policies" \
    PARMANA_API_KEYS="[{\"callerId\":\"drill-caller\",\"keyHash\":\"$API_KEY_HASH\",\"allowedCapabilities\":[\"*\"],\"allowedPrincipalIds\":[\"integration-test\"]}]" \
    PARMANA_PORT="$API_PORT" \
    PORT="$API_PORT" \
    PARMANA_SERVICE_PORT="$API_PORT" \
    PARMANA_DATABASE_CA_FILE= \
    PARMANA_ALLOW_UNGOVERNED_POLICY=true \
    EXECUTION_INTENTS_CHECK=true \
    SIGNING_READINESS_CHECK=true \
    node --import tsx src/server.ts > "$WORK/server.log" 2>&1 &
  SERVER_PID=$!
  cd "$ROOT"
}

wait_for_ready() {
  for _ in $(seq 1 60); do
    if curl -sf "http://127.0.0.1:$API_PORT/ready" > /dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  cat "$WORK/server.log" >&2
  fail "server did not become ready"
}

status() { curl -s -m 30 -o /dev/null -w "%{http_code}" "$@"; }

execute_with() {
  curl -s -m 60 -o "$WORK/body.json" -w "%{http_code}" \
    -X POST "http://127.0.0.1:$API_PORT/execute" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    --data @"$1"
}

new_transaction() {
  npx tsx scripts/drills/make-transaction.mts > "$1"
}

step "Migrations and policies"
PGDATABASE=postgres ROLES_FILE="$ROOT/docker/local/postgres-roles.sql" \
  MIGRATIONS_DIR="$ROOT/supabase/migrations" bash docker/local/migrate.sh
node docker/local/seed-policies.mjs

# Signing keys, generated for the drill only.
mkdir -p "$WORK/keys"
PARMANA_KEY_DIR="$WORK/keys" npx tsx scripts/generate-keypair.ts --algorithm ed25519 --key-id default > /dev/null
PARMANA_KEY_DIR="$WORK/keys" npx tsx scripts/generate-keypair.ts --algorithm ed25519 --key-id gateway > /dev/null

step "Start the TCP proxy"
LISTEN_PORT="$PROXY_LISTEN" TARGET_PORT="$PGPORT" CONTROL_PORT="$PROXY_CONTROL" \
  node scripts/drills/tcp-proxy.mjs > "$WORK/proxy.log" 2>&1 &
PROXY_PID=$!
sleep 2

step "Start the API"
start_server
wait_for_ready
echo "ready"

step "Baseline: an unapproved transaction is refused by policy"
new_transaction "$WORK/tx-baseline.json"
code="$(execute_with "$WORK/tx-baseline.json")"
[ "$code" = "403" ] || fail "baseline expected 403, got $code: $(cat "$WORK/body.json")"
grep -q POLICY_DENIED "$WORK/body.json" || fail "baseline body lacks POLICY_DENIED"
echo "403 POLICY_DENIED"

step "Fault 1: network cut between the API and the database"
curl -s -X POST "http://127.0.0.1:$PROXY_CONTROL/cut" > /dev/null
sleep 2
kill -0 "$SERVER_PID" 2>/dev/null || fail "process exited during the cut"
echo "process up"

# A liveness probe must keep answering during the cut. /health is served by
# the in-process limiter, so it does not depend on the database.
code="$(status "http://127.0.0.1:$API_PORT/health")"
[ "$code" = "200" ] || fail "/health during the cut returned $code, expected 200"
echo "/health during cut: 200"
echo "/ready during cut: $(status "http://127.0.0.1:$API_PORT/ready")"

new_transaction "$WORK/tx-cut.json"
code="$(execute_with "$WORK/tx-cut.json")"
case "$code" in
  5??) echo "execute during cut: $code" ;;
  *) fail "execute during cut returned $code, expected a 5xx: $(cat "$WORK/body.json")" ;;
esac
if grep -q '"trustRecordId"\|"authorization"' "$WORK/body.json"; then
  fail "a success body came back during the cut"
fi

step "Heal and recover"
curl -s -X POST "http://127.0.0.1:$PROXY_CONTROL/heal" > /dev/null
sleep 3
kill -0 "$SERVER_PID" 2>/dev/null || fail "process exited after the heal"
wait_for_ready
new_transaction "$WORK/tx-healed.json"
code="$(execute_with "$WORK/tx-healed.json")"
[ "$code" = "403" ] || fail "after heal expected 403, got $code: $(cat "$WORK/body.json")"
echo "recovered: 403 POLICY_DENIED"

step "Stop the server before the startup fault"
kill "$SERVER_PID"
wait "$SERVER_PID" 2>/dev/null || true
SERVER_PID=""

step "Fault 2: signing key missing at startup"
mv "$WORK/keys/default.private.pem" "$WORK/keys/default.private.pem.bak"
set +e
(start_server; wait "$SERVER_PID")
exit_code=$?
set -e
SERVER_PID=""
[ "$exit_code" = "1" ] || fail "expected exit code 1 without the key, got $exit_code"
grep -q 'Signing key material for keyId "default" is missing' "$WORK/server.log" \
  || fail "startup log does not name the missing key"
if curl -s -m 3 "http://127.0.0.1:$API_PORT/health" > /dev/null 2>&1; then
  fail "something is listening on the API port"
fi
echo "refused to start, exit code 1"

step "Drill passed"
