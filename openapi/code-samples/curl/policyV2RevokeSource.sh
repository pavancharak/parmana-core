# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Revoke a source
curl -X POST "https://parmana-api-real.vercel.app/v2/register/sources/erp-ledger/revoke" \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Key rotated"}'
