# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Record a decision
curl -X POST "https://parmana-api-real.vercel.app/v2/decisions" \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"capability":"erp:pay-invoice","transactionId":"txn-1001","target":"invoice-7781","parameters":{"amount":1200},"signals":{"vendorVerified":true}}'
