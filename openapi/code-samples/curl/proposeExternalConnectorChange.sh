curl -X POST https://parmana-api-real.vercel.app/external-connectors/changes \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "register",
    "capability": "erp:create-invoice",
    "endpointUrl": "https://erp.example.com/parmana/release",
    "policy": "erp-invoice",
    "allowedParameters": [
      "amount",
      "currency"
    ],
    "timeoutMs": 10000,
    "reason": "Finance creates invoices in the ERP through Parmana."
  }'
