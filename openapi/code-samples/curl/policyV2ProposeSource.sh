# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Propose a source
curl -X POST "https://parmana-api-real.vercel.app/v2/register/sources" \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"erp-ledger","dataOwner":"Finance","signer":{"kind":"system"},"keyId":"erp-2026-01","publicKeyPem":"-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA...\n-----END PUBLIC KEY-----","claims":{"invoiceAmount":"INR"},"canApprove":true}'
