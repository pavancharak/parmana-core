# Run in the folder that holds the new approver's public key file.
curl -X POST https://parmana-api-real.vercel.app/approval-issuers/changes \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  --data "$(jq -n --rawfile pem manager-priya__manager-priya-key-1.public.pem '{action: "add", approverId: "manager-priya", keyId: "manager-priya-key-1", publicKeyPem: $pem, reason: "Priya approves refunds for the West region from October."}')"
