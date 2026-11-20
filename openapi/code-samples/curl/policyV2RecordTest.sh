# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Record a passed test tier
curl -X POST "https://parmana-api-real.vercel.app/v2/register/actions/erp:pay-invoice/tests" \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tier":"tier-1"}'
