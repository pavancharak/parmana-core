#!/usr/bin/env bash
#
# Runs the commands of the self hosted quickstart
# (docs/site/self-hosted/quickstart.mdx) against a running deployment and
# fails if any output differs from what the page shows. CI runs it so the
# page stays true.
#
#   docker compose up -d --build --wait
#   bash docker/local/quickstart-check.sh
#
# Needs Node.js 24 or newer and `npm install` in the repository (step 4 signs
# with scripts/sign-policy-change-step-up.ts), and OpenSSL. Uses caller IDs
# made unique for the run, so it can run against a deployment more than once.
# It adds two API keys and leaves them; remove them with api-keys.mjs remove.

set -euo pipefail

cd "$(dirname "$0")/../.."
export MSYS_NO_PATHCONV=1

# A relative directory: native Windows tools (openssl, node) cannot open
# /tmp paths from Git Bash once MSYS_NO_PATHCONV is set.
work=".quickstart-check-$$"
mkdir "$work"
trap 'rm -rf "$work"' EXIT

run_id="$(date +%s)"
proposer="qs-proposer-$run_id"
approver="qs-approver-$run_id"

fail() {
  echo "FAIL  $1"
  exit 1
}

pass() {
  echo "PASS  $1"
}

page="docs/site/self-hosted/quickstart.mdx"

# Compares an output with the expected text, and checks that each line of
# the expected text is printed on the page, so the page and this script
# cannot drift apart.
expect_equal() {
  if [ "$2" != "$3" ]; then
    echo "expected: $3"
    echo "actual:   $2"
    fail "$1"
  fi
  while IFS= read -r line; do
    grep -qxF "$line" "$page" || fail "$1: the page does not show: $line"
  done <<< "$3"
  pass "$1"
}

helper() {
  docker compose run --rm --no-deps --entrypoint node setup "$@" 2>/dev/null
}

# Step 1
expect_equal "step 1: /ready" \
  "$(curl -s http://127.0.0.1:3000/ready)" \
  '{"status":"READY","authDisabled":false}'

# Step 2
OPERATOR_KEY=$(docker compose run --rm --no-deps --entrypoint cat setup /app/parmana-local/api-key.txt 2>/dev/null | tr -d '\r\n')
case "$OPERATOR_KEY" in
  pk_local_*) pass "step 2: API key read" ;;
  *) fail "step 2: API key read (parmana-local/api-key.txt missing or changed)" ;;
esac

expect_equal "step 2: /callers/me" \
  "$(curl -s http://127.0.0.1:3000/callers/me -H "Authorization: Bearer $OPERATOR_KEY")" \
  '{"callerId":"local-operator","allowedPrincipalIds":["local-operator"],"allowedCapabilities":["paytm:refund"],"unrestrictedCapabilities":false}'

# Step 3
openssl genpkey -algorithm ed25519 -out "$work/step-up.private.pem"
openssl pkey -in "$work/step-up.private.pem" -pubout -out "$work/step-up.public.pem"

ALICE_KEY=$(helper /app/docker/local/api-keys.mjs add --caller-id "$proposer" --credential-holder-type USER | grep '^pk_local_')
BOB_KEY=$(docker compose run --rm -T --no-deps --entrypoint node setup \
  /app/docker/local/api-keys.mjs add --caller-id "$approver" --credential-holder-type USER \
  --step-up-public-key-stdin < "$work/step-up.public.pem" 2>/dev/null | grep '^pk_local_')
[ -n "$ALICE_KEY" ] && [ -n "$BOB_KEY" ] || fail "step 3: keys added"
pass "step 3: keys added"

docker compose restart api >/dev/null 2>&1
docker compose up -d --wait api >/dev/null 2>&1

helper /app/docker/local/api-keys.mjs list > "$work/list.txt"
grep -q "callerId=$proposer  credentialHolderType=USER  allowedCapabilities=(none)  allowedPrincipalIds=(own caller ID only)  stepUpKey=no" "$work/list.txt" ||
  fail "step 3: list shows the proposer"
grep -q "callerId=$approver  credentialHolderType=USER  allowedCapabilities=(none)  allowedPrincipalIds=(own caller ID only)  stepUpKey=yes" "$work/list.txt" ||
  fail "step 3: list shows the approver"
pass "step 3: list"

# Step 4. Runs only when customer-refund 1.2.0 has never been approved on
# this deployment. If it has, approving the shipped content again would
# replace whatever version is in effect, so the step is skipped. An open
# proposal stops the run, because a second one would be refused.
curl -s "http://127.0.0.1:3000/policies/pending-changes" \
  -H "Authorization: Bearer $ALICE_KEY" > "$work/changes.json"

policy_state=$(node -e '
  const { changes } = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const mine = changes.filter((c) => c.policyName === "customer-refund" && c.policyVersion === "1.2.0");
  console.log(mine.some((c) => c.status === "PENDING_APPROVAL") ? "pending"
    : mine.some((c) => c.status === "APPROVED") ? "approved" : "none");
' "$work/changes.json")

if [ "$policy_state" = "pending" ]; then
  fail "step 4: an open proposal for customer-refund 1.2.0 exists; approve or reject it first"
fi

if [ "$policy_state" = "approved" ]; then
  echo "SKIP  step 4: customer-refund 1.2.0 is already approved on this deployment"
else
  printf '{"reason":"Adopt the shipped customer-refund policy.","proposedContent":%s}' \
    "$(cat policies/customer-refund/1.2.0/policy.json)" > "$work/proposal.json"

  curl -s -X POST http://127.0.0.1:3000/policies/customer-refund/1.2.0/pending-changes \
    -H "Authorization: Bearer $ALICE_KEY" -H "Content-Type: application/json" \
    --data @"$work/proposal.json" > "$work/proposed.json"

  CHANGE_ID=$(sed -n 's/.*"pendingPolicyChangeId":"\([^"]*\)".*/\1/p' "$work/proposed.json")
  [ -n "$CHANGE_ID" ] || { cat "$work/proposed.json"; fail "step 4a: proposal"; }
  pass "step 4a: proposal"

  npx tsx scripts/sign-policy-change-step-up.ts \
    --private-key-file "$work/step-up.private.pem" --key-id "$approver" \
    --pending-policy-change-id "$CHANGE_ID" --action approve > "$work/signed.txt" 2>/dev/null

  STEP_UP=$(grep '^{' "$work/signed.txt")

  curl -s -X POST "http://127.0.0.1:3000/policies/pending-changes/$CHANGE_ID/approve" \
    -H "Authorization: Bearer $BOB_KEY" -H "Content-Type: application/json" \
    -d "{\"stepUpAuthorization\":$STEP_UP}" > "$work/approved.json"

  grep -q '"status":"APPROVED"' "$work/approved.json" || { cat "$work/approved.json"; fail "step 4c: approval"; }
  pass "step 4c: approval"
fi

# Step 5
helper /app/docker/local/examples/refund-request.mjs --amount 50000 > "$work/refund.json"

expect_equal "step 5: refused decision" \
  "$(curl -s -w '\nHTTP %{http_code}' -X POST http://127.0.0.1:3000/execute \
    -H "Authorization: Bearer $OPERATOR_KEY" -H "Content-Type: application/json" \
    --data @"$work/refund.json")" \
  "$(printf '%s\n%s' '{"error":"Execution rejected: Refund rejected. Every refund needs a signed manager approval for this order, covering this amount, in signals.approvalArtifact, with managerApproved true, and every other policy condition satisfied.","code":"POLICY_DENIED"}' 'HTTP 403')"

# Step 6
BTX=$(sed -n 's/.*"businessTransactionId": "\([^"]*\)".*/\1/p' "$work/refund.json" | head -1)
curl -s "http://127.0.0.1:3000/refusal/$BTX" -H "Authorization: Bearer $OPERATOR_KEY" > "$work/refusal.json"

expect_equal "step 6: Refusal Record verifies" \
  "$(curl -s -X POST http://127.0.0.1:3000/refusal/verify -H "Content-Type: application/json" --data @"$work/refusal.json")" \
  '{"valid":true}'

sed 's/"refundAmount":50000/"refundAmount":500/' "$work/refusal.json" > "$work/tampered.json"
expect_equal "step 6: changed Refusal Record fails" \
  "$(curl -s -X POST http://127.0.0.1:3000/refusal/verify -H "Content-Type: application/json" --data @"$work/tampered.json")" \
  '{"valid":false}'

# Closing note of the page: a small refund without an approval is refused
# too (G-75): the agent's own eligibility and fraud claims are not enough.
helper /app/docker/local/examples/refund-request.mjs --amount 500 > "$work/small.json"
curl -s -o "$work/small-response.json" -w '%{http_code}' -X POST http://127.0.0.1:3000/execute   -H "Authorization: Bearer $OPERATOR_KEY" -H "Content-Type: application/json"   --data @"$work/small.json" > "$work/small-status.txt"
[ "$(cat "$work/small-status.txt")" = "403" ] && grep -q "POLICY_DENIED" "$work/small-response.json" ||
  fail "a small refund without an approval is refused"
pass "a small refund without an approval is refused"

echo
echo "The quickstart matches the page."
