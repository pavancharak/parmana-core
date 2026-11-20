# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Amazon SES posts this; clients do not call it
curl -X POST "https://parmana-api-real.vercel.app/v2/notifications/ses" \
  -H "Content-Type: application/json" \
  -d '{"Type":"Notification","Message":"{}"}'
