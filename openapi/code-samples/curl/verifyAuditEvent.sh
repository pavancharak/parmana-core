# A signed audit event and its signature, as exported from caller_audit_events:
curl -X POST https://parmana-api-real.vercel.app/audit/verify \
  -H "Content-Type: application/json" \
  --data @audit-event.json
