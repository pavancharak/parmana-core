# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# List what is missing before go-live
curl "https://parmana-api-real.vercel.app/v2/register/actions/erp:pay-invoice/go-live" \
  -H "Authorization: Bearer $PARMANA_API_KEY"
