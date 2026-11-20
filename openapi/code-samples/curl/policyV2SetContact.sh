# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Set a contact
curl -X POST "https://parmana-api-real.vercel.app/v2/register/contacts" \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"personId":"person-1","email":"ops@example.com"}'
