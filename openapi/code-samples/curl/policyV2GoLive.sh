# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Take an action live, if its gate is met
curl -X POST "https://parmana-api-real.vercel.app/v2/register/actions/erp:pay-invoice/go-live" \
  -H "Authorization: Bearer $PARMANA_API_KEY"
