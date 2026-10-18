#!/usr/bin/env bash
#
# Minimal process supervisor: runs the API server, forwards SIGTERM/SIGINT
# to it, and exits with its exit code.

set -euo pipefail

node packages/api/dist/server.js &
API_PID=$!

echo "[entrypoint] started API (pid $API_PID)"

shutdown() {
  echo "[entrypoint] shutting down: forwarding TERM to API (pid $API_PID)"
  kill -TERM "$API_PID" 2>/dev/null || true
  wait "$API_PID" 2>/dev/null || true
}

trap 'shutdown; exit 0' TERM INT

set +e
wait "$API_PID"
API_EXIT=$?
set -e

echo "[entrypoint] API server exited with code $API_EXIT"
exit "$API_EXIT"
