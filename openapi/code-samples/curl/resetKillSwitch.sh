curl -X POST https://your-parmana-server/kill-switch/reset \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"reason": "reviewed, safe"}'
