# proposal.json: {"reason": "...", "proposedContent": <the policy file, unchanged>}
curl -X POST https://parmana-api-real.vercel.app/policies/customer-refund/1.3.0/pending-changes \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  --data @proposal.json
