# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Revoke a reviewer's grant
curl -X POST "https://parmana-api-real.vercel.app/v2/register/actions/erp:pay-invoice/reviewers/reviewer-1/revoke" \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Left the team"}'
