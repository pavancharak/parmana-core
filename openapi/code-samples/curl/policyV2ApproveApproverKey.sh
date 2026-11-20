# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Approve an approver key
curl -X POST "https://parmana-api-real.vercel.app/v2/register/approver-keys/approver-7/key-2026-01/approve" \
  -H "Authorization: Bearer $PARMANA_API_KEY"
