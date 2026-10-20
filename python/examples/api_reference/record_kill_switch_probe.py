import json
import os
import urllib.request

request = urllib.request.Request(
    "https://your-parmana-server/kill-switch/probes",
    data=json.dumps({"status": 503, "errorCode": "KILL_SWITCH_ACTIVE"}).encode(),
    headers={
        "Authorization": f"Bearer {os.environ.get('PARMANA_PROBE_KEY', '')}",
        "Content-Type": "application/json",
    },
    method="POST",
)

with urllib.request.urlopen(request) as response:
    print(json.loads(response.read()))
