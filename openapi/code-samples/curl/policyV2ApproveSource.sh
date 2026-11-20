# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Approve a source
curl -X POST "https://parmana-api-real.vercel.app/v2/register/sources/erp-ledger/approve" \
  -H "Authorization: Bearer $PARMANA_API_KEY"
