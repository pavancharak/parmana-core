# TXN_ID: the businessTransactionId of the transaction. In the sandbox, use one from a playground run;
# sandbox data is deleted hourly, so an older id returns 404.
TXN_ID="${TXN_ID:?set TXN_ID to a businessTransactionId}"
curl https://parmana-sandbox.vercel.app/refusal/$TXN_ID \
  -H "Authorization: Bearer $PARMANA_API_KEY"
