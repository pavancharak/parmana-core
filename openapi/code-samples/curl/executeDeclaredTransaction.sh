# Executes a declared Business Transaction. Declare it first with POST /transactions
# (see the createTransaction sample), then set TXN_ID to its businessTransactionId.
# Nothing is released before this call.
TXN_ID="6f6582a1-4e1a-4800-a73b-cb4c3aa32110"
curl -X POST "https://parmana-api-real.vercel.app/transactions/$TXN_ID/execute" \
  --silent \
  -H "Authorization: Bearer $PARMANA_API_KEY"
