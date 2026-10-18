# The Refusal Record, as returned by GET /refusal/5f0c2a7e-3d7b-4d0e-9a55-2f6d8b1c4e90:
curl -X POST https://parmana-api-real.vercel.app/refusal/verify \
  -H "Content-Type: application/json" \
  --data @refusal-record.json
