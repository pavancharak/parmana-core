# Sign the step up authorization on your own machine first:
#   npx tsx scripts/sign-policy-change-step-up.ts --private-key-file step-up.private.pem \
#     --key-id checker-step-up-1 --pending-policy-change-id ba7c5827-5844-4069-94fc-9b438ef08f78 --action approve > step-up.json
curl -X POST https://parmana-api-real.vercel.app/external-connectors/changes/ba7c5827-5844-4069-94fc-9b438ef08f78/approve \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  --data "{\"stepUpAuthorization\": $(cat step-up.json)}"
