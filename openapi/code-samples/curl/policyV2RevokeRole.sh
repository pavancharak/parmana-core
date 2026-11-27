# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Revoke a role
curl -X POST "https://parmana-api-real.vercel.app/v2/register/roles/revoke" \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"callerId":"caller-ops-1","role":"reviewer"}'
