curl -X POST https://parmana-api-real.vercel.app/execute \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "businessTransactionId": "44b34a79-e0f2-49d7-a48e-e52fff88182e",
    "metadata": {
      "businessTransactionId": "44b34a79-e0f2-49d7-a48e-e52fff88182e",
      "correlationId": "cc1ca975-4935-4e9a-a591-8897af6b56fb",
      "sourceSystem": "vendor-payment-service",
      "submittedBy": "ap-automation",
      "submittedAt": "2026-07-13T17:36:00.835Z"
    },
    "authority": {
      "authorityId": "db5c5260-bb4c-40a2-a081-2928b5fe7720",
      "authorityType": "SERVICE",
      "principalId": "ap-automation-svc",
      "displayName": "Accounts Payable Automation",
      "issuedAt": "2026-07-13T17:36:00.835Z"
    },
    "authorization": {
      "authorizationId": "63bdc429-14e4-4ef4-8007-f3c0c9564261",
      "authorityId": "db5c5260-bb4c-40a2-a081-2928b5fe7720",
      "purpose": "Authorize vendor payment disbursement",
      "issuedAt": "2026-07-13T17:36:00.835Z"
    },
    "intent": {
      "intentId": "1e77d0b3-2e57-4e31-b780-03abc92f1b69",
      "authorizationId": "63bdc429-14e4-4ef4-8007-f3c0c9564261",
      "action": "payments:execute",
      "target": "vendor/V-500",
      "parameters": {
        "amount": 5000,
        "currency": "USD"
      },
      "createdAt": "2026-07-13T17:36:00.835Z"
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
      "paymentAmount": 5000,
      "riskScore": 12
    }
  }'
