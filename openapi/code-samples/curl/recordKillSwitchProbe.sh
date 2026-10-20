curl -X POST https://your-parmana-server/kill-switch/probes \
  -H "Authorization: Bearer $PARMANA_PROBE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status": 503, "errorCode": "KILL_SWITCH_ACTIVE"}'
