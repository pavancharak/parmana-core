#!/usr/bin/env bash
#
# Runs the offline check (G-60) from the repository root:
#
#   bash docker/local/offline-check/run.sh
#
# 1. Builds the API image and pulls Postgres while the internet is reachable.
# 2. Runs setup once, so ./parmana-local has keys and an API key.
# 3. Starts the stack on a network with no internet route, runs the check,
#    and removes the check's containers and database. The deployment started
#    by docker-compose.yml is not touched.
#
# Exit code 0 means every check passed. The Trust Record from the run is left
# in parmana-local/offline-check/trust-record.json.

set -euo pipefail

cd "$(dirname "$0")/../../.."

compose() {
  docker compose \
    -f docker-compose.yml \
    -f docker-compose.offline-check.yml \
    -p parmana-offline-check \
    "$@"
}

echo "== Building images while the internet is reachable"
docker compose build
docker pull postgres:16

echo "== Making keys and an API key if they do not exist yet"
docker compose run --rm setup

cleanup() {
  echo "== Removing the offline check's containers and database"
  compose --profile check down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "== Starting the stack with no internet route"
compose up -d --wait api paytm-agent-stand-in

echo "== Running the check"
set +e
compose --profile check run --rm offline-check
status=$?
set -e

if [ "$status" -ne 0 ]; then
  echo "== The check failed. API log:"
  compose logs api | tail -50
fi

exit "$status"
