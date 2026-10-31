# The intent, as returned in .intent by GET /execution-intents/<businessTransactionId>:
curl -X POST https://parmana-api-real.vercel.app/execution-intents/verify \
  -H "Content-Type: application/json" \
  --data @execution-intent.json
