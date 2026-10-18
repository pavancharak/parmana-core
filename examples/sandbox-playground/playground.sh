export PARMANA_URL=https://parmana-sandbox.vercel.app
export PARMANA_API_KEY=2VfYWCzt_cBAPK-8uufX6ordfY2JuQhFPsohuEumKME   # the published sandbox demo key

# 1. Who am I?
curl -s $PARMANA_URL/callers/me -H "Authorization: Bearer $PARMANA_API_KEY"
echo

# 2. What must a request carry?
curl -s "$PARMANA_URL/policies/in-effect?capability=sandbox:receipt" -H "Authorization: Bearer $PARMANA_API_KEY"
echo

# 3. Send a request with no approval: refused.
TARGET="order-$(date +%s)"
send() {  # $1 = note, $2 = the rest of the signals
  ID=$(uuidgen | tr 'A-Z' 'a-z')
  curl -s -X POST $PARMANA_URL/execute \
    -H "Authorization: Bearer $PARMANA_API_KEY" -H "Content-Type: application/json" \
    -d '{
      "businessTransactionId": "'$ID'",
      "metadata": { "businessTransactionId": "'$ID'" },
      "authority": { "authorityId": "authority-1", "authorityType": "SERVICE",
                     "principalId": "sandbox-visitor", "issuedAt": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'" },
      "authorization": { "authorizationId": "authorization-1", "authorityId": "authority-1",
                         "purpose": "Trying the Parmana sandbox", "issuedAt": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'" },
      "intent": { "intentId": "intent-1", "authorizationId": "authorization-1", "action": "sandbox:receipt",
                  "target": "'$TARGET'", "parameters": { "note": "'"$1"'" },
                  "createdAt": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'" },
      "policy": { "name": "sandbox-receipt", "version": "1.0.0", "schemaVersion": "1.0.0" },
      "signals": { "note": "'"$1"'", '"$2"' }
    }'
  echo
}
send "hello" '"receiptApproved": false'

# 4. Get a demo approval for this target.
APPROVAL=$(curl -s -X POST $PARMANA_URL/sandbox/approvals \
  -H "Authorization: Bearer $PARMANA_API_KEY" -H "Content-Type: application/json" \
  -d '{ "capability": "sandbox:receipt", "resourceId": "'$TARGET'" }')
echo "$APPROVAL"

# 5. Send it again with the approval: approved, released, signed.
send "hello" '"receiptApproved": true, "approvalArtifact": '"$APPROVAL"

# 6. The same approval again: refused.
send "again" '"receiptApproved": true, "approvalArtifact": '"$APPROVAL"
