#!/usr/bin/env bash
# REST smoke test for the endpoints documented in docs/developer-portal/api/endpoints.md.
# Sends each request with curl and checks the HTTP status against the documented one.
#
# Prerequisites: setup.mjs has run, the server is running (start-server.sh), and the
# policy version in effect is the one you pass (default 2.1.0, approved by governed-flow.ts).
#
#   bash docs/developer-portal/examples/governed-quickstart/rest-smoke.sh
#
# Environment:
#   PARMANA_API_URL        default http://localhost:3000
#   GOVERNED_CONFIG_DIR    default ~/.parmana/governed-quickstart
#   GOVERNED_POLICY_VERSION default 2.1.0 (must be the version in effect)
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../../.." && pwd)"
CONFIG_DIR="${GOVERNED_CONFIG_DIR:-$HOME/.parmana/governed-quickstart}"
API="${PARMANA_API_URL:-http://localhost:3000}"
VERSION="${GOVERNED_POLICY_VERSION:-2.1.0}"
KEY="$(node -e "console.log(require(process.argv[1]).demo)" "$CONFIG_DIR/raw-keys.json")"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass=0; fail=0
# check <label> <expected-status> <method> <path> [extra curl args...]
# Sets BODY to the response body, and STATUS to the HTTP status.
check() {
  local label="$1" expected="$2" method="$3" path="$4"; shift 4
  local out
  out="$(curl -s -m 30 -X "$method" -w '\n%{http_code}' "$@" "$API$path")"
  STATUS="$(printf '%s' "$out" | tail -n1)"
  BODY="$(printf '%s' "$out" | sed '$d')"
  if [[ "$STATUS" == "$expected" ]]; then
    pass=$((pass + 1)); printf 'PASS  %-46s %s\n' "$label" "$STATUS"
  else
    fail=$((fail + 1)); printf 'FAIL  %-46s expected %s, got %s: %s\n' "$label" "$expected" "$STATUS" "${BODY:0:160}"
  fi
}
json() { node -e "const b=JSON.parse(process.argv[1]);const v=process.argv[2].split('.').reduce((o,k)=>o==null?o:o[k],b);console.log(v===undefined?'':v)" "$BODY" "$1"; }
AUTH=(-H "Authorization: Bearer $KEY")
JSONH=(-H "Content-Type: application/json")

echo "Parmana REST smoke test against $API (policy version $VERSION)"
echo

check "GET /health (no key)" 200 GET /health
check "GET /ready (no key)" 200 GET /ready
check "GET /version without a key" 401 GET /version
check "GET /version with a key" 200 GET /version "${AUTH[@]}"
check "GET /callers/me" 200 GET /callers/me "${AUTH[@]}"
check "GET /keys/default" 200 GET /keys/default "${AUTH[@]}"
check "GET /.well-known/jwks.json" 200 GET /.well-known/jwks.json "${AUTH[@]}"
check "GET /policies/in-effect without capability" 400 GET "/policies/in-effect" "${AUTH[@]}"
check "GET /policies/in-effect unbound capability" 404 GET "/policies/in-effect?capability=test:fixture-execute" "${AUTH[@]}"
check "POST /policies/validate" 200 POST /policies/validate "${AUTH[@]}" "${JSONH[@]}" \
  -d "{\"policyId\":\"vendor-payment\",\"policyVersion\":\"$VERSION\"}"

# Make transactions with the TypeScript helper (signs the approval with the test approver key).
TXN_ID="$(cd "$REPO" && npx tsx "$HERE/typescript/make-transaction.ts" "$WORK/txn.json" "$VERSION")"
REFUSE_ID="$(cd "$REPO" && npx tsx "$HERE/typescript/make-transaction.ts" "$WORK/refuse.json" "$VERSION" --no-approval)"

check "POST /execute with a bad UUID" 400 POST /execute "${AUTH[@]}" "${JSONH[@]}" -d '{"businessTransactionId":"nope"}'
check "POST /execute, approved" 200 POST /execute "${AUTH[@]}" "${JSONH[@]}" --data @"$WORK/txn.json"
RECORD_ID="$(json trustRecordId)"
check "POST /execute, same id again" 409 POST /execute "${AUTH[@]}" "${JSONH[@]}" --data @"$WORK/txn.json"
check "POST /execute, no approval (refused)" 403 POST /execute "${AUTH[@]}" "${JSONH[@]}" --data @"$WORK/refuse.json"
check "GET /refusal/{id} for the refusal" 200 GET "/refusal/$REFUSE_ID" "${AUTH[@]}"
check "GET /trust-records/{id}" 200 GET "/trust-records/$TXN_ID" "${AUTH[@]}"
check "GET /trust-records/{unknown}" 404 GET "/trust-records/00000000-0000-4000-8000-000000000000" "${AUTH[@]}"
check "POST /verify" 200 POST /verify "${AUTH[@]}" "${JSONH[@]}" -d "{\"businessTransactionId\":\"$TXN_ID\"}"
check "GET /verification/{id}" 200 GET "/verification/$TXN_ID" "${AUTH[@]}"
check "POST /replay" 200 POST /replay "${AUTH[@]}" "${JSONH[@]}" -d "{\"businessTransactionId\":\"$TXN_ID\"}"
check "POST /receipt (after VERIFIED)" 200 POST /receipt "${AUTH[@]}" "${JSONH[@]}" -d "{\"businessTransactionId\":\"$TXN_ID\"}"
check "GET /receipt/latest/{id}" 200 GET "/receipt/latest/$TXN_ID" "${AUTH[@]}"
check "GET /transactions/{id}/status" 200 GET "/transactions/$TXN_ID/status?history=true" "${AUTH[@]}"
check "GET /transactions?page=1&pageSize=2" 200 GET "/transactions?page=1&pageSize=2" "${AUTH[@]}"
check "GET /transactions/{unknown}" 404 GET "/transactions/00000000-0000-4000-8000-000000000000" "${AUTH[@]}"

DECLARE_ID="$(cd "$REPO" && npx tsx "$HERE/typescript/make-transaction.ts" "$WORK/declare.json" "$VERSION")"
check "POST /transactions (declare)" 201 POST /transactions "${AUTH[@]}" "${JSONH[@]}" --data @"$WORK/declare.json"
check "POST /transactions/{id}/execute" 200 POST "/transactions/$DECLARE_ID/execute" "${AUTH[@]}"

echo
echo "passed: $pass   failed: $fail"
[[ "$fail" -eq 0 ]]
