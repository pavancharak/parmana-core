# Sign the step up authorization on your own machine first:
#   npx tsx scripts/sign-policy-change-step-up.ts --private-key-file step-up.private.pem \
#     --key-id checker-step-up-1 --pending-policy-change-id 9f3cf733-a8ed-487c-bb58-a53950388cdf --action approve > step-up.json
curl -X POST https://parmana-api-real.vercel.app/authority-grants/changes/9f3cf733-a8ed-487c-bb58-a53950388cdf/approve \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  --data "{\"stepUpAuthorization\": $(cat step-up.json)}"
