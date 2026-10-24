# Sandbox: a receipt for a note, released only with a signed approval.
# Each businessTransactionId can be used once: use a new UUID for every run
# (for example, the output of uuidgen) in both places marked below.
# Without the approval (receiptApproved false) the request is refused.
# To release it, first get an approval from POST /sandbox/approvals for the
# same target and add it as signals.approvalArtifact with receiptApproved true.
curl -X POST https://parmana-sandbox.vercel.app/execute \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "businessTransactionId": "REPLACE-WITH-A-NEW-UUID",
    "metadata": {
      "businessTransactionId": "REPLACE-WITH-A-NEW-UUID",
      "correlationId": "cc1ca975-4935-4e9a-a591-8897af6b56fb",
      "sourceSystem": "docs-example",
      "submittedBy": "docs-reader",
      "submittedAt": "2026-07-13T17:36:00.835Z"
    },
    "authority": {
      "authorityId": "authority-1",
      "authorityType": "SERVICE",
      "principalId": "sandbox-visitor",
      "issuedAt": "2026-07-13T17:36:00.835Z"
    },
    "authorization": {
      "authorizationId": "authorization-1",
      "authorityId": "authority-1",
      "purpose": "Trying the Parmana sandbox",
      "issuedAt": "2026-07-13T17:36:00.835Z"
    },
    "intent": {
      "intentId": "intent-1",
      "authorizationId": "authorization-1",
      "action": "sandbox:receipt",
      "target": "order-docs-example",
      "parameters": { "note": "hello" },
      "createdAt": "2026-07-13T17:36:00.835Z"
    },
    "policy": {
      "name": "sandbox-receipt",
      "version": "1.0.0",
      "schemaVersion": "1.0.0"
    },
    "signals": {
      "note": "hello",
      "receiptApproved": false
    }
  }'
