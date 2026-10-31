curl -X POST https://parmana-api-real.vercel.app/policies/validate \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "policyId": "customer-refund",
    "policyVersion": "1.2.0"
  }'
