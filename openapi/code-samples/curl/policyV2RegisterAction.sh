# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Register an action
curl -X POST "https://parmana-api-real.vercel.app/v2/register/actions" \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"capability":"erp:pay-invoice","owner":"Finance","successor":"Finance Controller","reviewers":["reviewer-1"],"review":{"reviewWindowBusinessDays":2,"approvalValidityMinutes":120}}'
