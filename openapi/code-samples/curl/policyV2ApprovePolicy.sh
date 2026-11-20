# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Approve a policy version
curl -X POST "https://parmana-api-real.vercel.app/v2/register/policies/erp:pay-invoice/2.0.0/approve" \
  -H "Authorization: Bearer $PARMANA_API_KEY"
