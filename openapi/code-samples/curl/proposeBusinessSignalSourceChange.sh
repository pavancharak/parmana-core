# erp-answers.public.pem: the Ed25519 public key the ERP signs its answers with.
curl -X POST https://parmana-api-real.vercel.app/business-signal-sources/changes \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  --data "$(jq -n --rawfile key erp-answers.public.pem '{
    action: "register",
    name: "erp",
    endpointUrl: "https://orders.example.com/parmana/signals",
    timeoutMs: 5000,
    publicKeyPem: $key,
    keyId: "erp-2026-10",
    reason: "Release goods only against invoices the ERP says are paid."
  }')"
