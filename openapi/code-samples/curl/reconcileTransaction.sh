# Reconciles a transaction whose outcome is pending (status EXECUTING). Operator
# credentials only: a plain API key is refused with 403. Nothing is released.
TXN_ID="6f6582a1-4e1a-4800-a73b-cb4c3aa32110"
curl -X POST "https://parmana-api-real.vercel.app/transactions/$TXN_ID/reconcile" \
  --silent \
  -H "Authorization: Bearer $PARMANA_OPERATOR_KEY"
