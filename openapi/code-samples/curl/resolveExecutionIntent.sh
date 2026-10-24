# TXN_ID: the businessTransactionId of the transaction. In the sandbox, use one from a playground run;
# sandbox data is deleted hourly, so an older id returns 404.
TXN_ID="${TXN_ID:?set TXN_ID to a businessTransactionId}"
curl -X POST https://parmana-api-real.vercel.app/execution-intents/$TXN_ID/resolve \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$(cat <<JSON
{
    "resolution": "NOT_EXECUTED",
    "note": "Checked the Paytm dashboard for order ORD-1042. No refund exists."
}
JSON
)"
