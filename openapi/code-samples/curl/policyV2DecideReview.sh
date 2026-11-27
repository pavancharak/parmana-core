# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Decide a review as a reviewer
curl -X POST "https://parmana-api-real.vercel.app/v2/reviews/review-123/decision" \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"decision":"approve"}'
