# The Refusal Record, as returned by GET /refusal/<businessTransactionId>:
curl -X POST https://parmana-sandbox.vercel.app/refusal/verify \
  -H "Content-Type: application/json" \
  --data @refusal-record.json
