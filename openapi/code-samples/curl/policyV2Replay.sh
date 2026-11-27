# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Replay a recorded decision
curl "https://parmana-api-real.vercel.app/v2/evidence/record-123/replay" \
  -H "Authorization: Bearer $PARMANA_API_KEY"
