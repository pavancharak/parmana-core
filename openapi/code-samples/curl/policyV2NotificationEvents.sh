# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Delivery events; clients do not call it
curl -X POST "https://parmana-api-real.vercel.app/v2/notifications/events" \
  -H "Content-Type: application/json" \
  -d '[{"type":"Delivery"}]'
