# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Propose an approver key
curl -X POST "https://parmana-api-real.vercel.app/v2/register/approver-keys" \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"approverId":"approver-7","keyId":"key-2026-01","publicKeyPem":"-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA...\n-----END PUBLIC KEY-----"}'
