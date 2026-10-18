curl -X POST https://parmana-api-real.vercel.app/authority-grants/changes \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "grant",
    "callerId": "warehouse-agent",
    "capability": "erp:release-goods",
    "limits": {
      "parameters.amount": { "max": 100000 },
      "parameters.currency": { "oneOf": ["INR"] }
    },
    "validUntil": "2026-12-30T00:00:00.000Z",
    "reason": "The warehouse agent releases goods for paid invoices up to 100000 INR this quarter."
  }'
