# Run in the folder that holds the new approver's public key file.
curl -X POST https://parmana-api-real.vercel.app/approval-issuers/changes \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  --data "$(jq -n --rawfile pem approver-example__approver-example-key-1.public.pem '{action: "add", approverId: "approver-example", keyId: "approver-example-key-1", publicKeyPem: $pem, reason: "The approver approves refunds for the West region from October."}')"
