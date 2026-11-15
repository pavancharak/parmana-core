# Reads the status of a declared Business Transaction, with its full history.
# Replace the id with the businessTransactionId you declared.
TXN_ID="6f6582a1-4e1a-4800-a73b-cb4c3aa32110"
curl "https://parmana-api-real.vercel.app/transactions/$TXN_ID/status?history=true" \
  --silent \
  -H "Authorization: Bearer $PARMANA_API_KEY"
