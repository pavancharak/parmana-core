curl -X POST https://parmana-api-real.vercel.app/execution-intents/5f0c2a7e-3d7b-4d0e-9a55-2f6d8b1c4e90/resolve \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resolution": "NOT_EXECUTED",
    "note": "Checked the Paytm dashboard for order ORD-1042. No refund exists."
  }'
