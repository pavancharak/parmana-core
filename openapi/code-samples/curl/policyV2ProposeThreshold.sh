# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Propose a threshold
curl -X POST "https://parmana-api-real.vercel.app/v2/register/thresholds" \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"erp:pay-invoice","name":"max-amount","value":5000,"unit":"INR","owner":"Finance","reason":"Limit payments without review","evidence":"Policy memo 2026-11","nextReview":"2027-05-01","highValue":true}'
