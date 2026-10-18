curl -X POST https://parmana-sandbox.vercel.app/sandbox/approvals   -H "Authorization: Bearer $PARMANA_API_KEY"   -H "Content-Type: application/json"   -d '{
    "capability": "sandbox:receipt",
    "resourceId": "demo-order-1"
  }'
