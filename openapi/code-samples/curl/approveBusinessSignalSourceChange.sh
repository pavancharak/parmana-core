# Sign the step up authorization on your own machine first:
#   npx tsx scripts/sign-policy-change-step-up.ts --private-key-file step-up.private.pem \
#     --key-id checker-step-up-1 --pending-policy-change-id 5ba7d3a6-d56d-4e90-b588-402d44aeee0c --action approve > step-up.json
curl -X POST https://parmana-api-real.vercel.app/business-signal-sources/changes/5ba7d3a6-d56d-4e90-b588-402d44aeee0c/approve \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  --data "{\"stepUpAuthorization\": $(cat step-up.json)}"
