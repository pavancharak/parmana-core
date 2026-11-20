# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Approve a threshold
curl -X POST "https://parmana-api-real.vercel.app/v2/register/thresholds/erp:pay-invoice/max-amount/approve" \
  -H "Authorization: Bearer $PARMANA_API_KEY"
