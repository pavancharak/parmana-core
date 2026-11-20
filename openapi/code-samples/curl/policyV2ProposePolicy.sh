# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Propose a policy version. Replace {} with the policy document.
curl -X POST "https://parmana-api-real.vercel.app/v2/register/policies" \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
