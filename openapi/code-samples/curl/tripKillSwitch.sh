curl -X POST https://your-parmana-server/kill-switch/trip \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"reason": "suspicious refunds"}'
