# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Grant a role
curl -X POST "https://parmana-api-real.vercel.app/v2/register/roles/grant" \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"callerId":"caller-ops-1","role":"reviewer"}'
