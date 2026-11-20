# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Grant a reviewer on an action
curl -X POST "https://parmana-api-real.vercel.app/v2/register/actions/erp:pay-invoice/reviewers" \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"reviewerId":"reviewer-1","maxAmount":10000}'
