curl -X POST https://parmana-api-real.vercel.app/transactions \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "businessTransactionId": "4cfe5661-42a6-4db0-8372-2d24dca235f2",
    "metadata": {
      "businessTransactionId": "4cfe5661-42a6-4db0-8372-2d24dca235f2",
      "sourceSystem": "docs-api-reference",
      "submittedBy": "docs-example"
    },
    "authority": {
      "authorityId": "be8afa44-ee3c-44c2-a4a2-ba119e128948",
      "authorityType": "SERVICE",
      "principalId": "docs-example-caller",
      "issuedAt": "2026-09-14T17:18:27.000Z"
    },
    "authorization": {
      "authorizationId": "81a1c120-d296-458b-bbe5-824a8617f23a",
      "authorityId": "be8afa44-ee3c-44c2-a4a2-ba119e128948",
      "purpose": "API reference example: transactions endpoint",
      "issuedAt": "2026-09-14T17:18:27.000Z"
    },
    "intent": {
      "intentId": "ceb89d68-13ac-4ff9-b7b9-dd0e15637baa",
      "authorizationId": "81a1c120-d296-458b-bbe5-824a8617f23a",
      "action": "test:fixture-execute",
      "target": "vendor://payments",
      "parameters": {
        "amount": 250,
        "currency": "USD"
      },
      "createdAt": "2026-09-14T17:18:27.000Z"
    },
    "policy": {
      "name": "vendor-payment",
      "version": "2.0.0",
      "schemaVersion": "1.0.0"
    },
    "signals": {
      "vendorVerified": true,
      "invoiceVerified": true,
      "paymentApproved": true,
      "sufficientFunds": true,
      "paymentAmount": 250,
      "riskScore": 5,
      "vendorId": "vendor://payments"
    }
  }'
