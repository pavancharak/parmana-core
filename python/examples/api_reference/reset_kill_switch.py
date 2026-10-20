import json
import os
import urllib.request

request = urllib.request.Request(
    "https://your-parmana-server/kill-switch/reset",
    data=json.dumps({"reason": "reviewed, safe"}).encode(),
    headers={
        "Authorization": f"Bearer {os.environ.get('PARMANA_API_KEY', '')}",
        "Content-Type": "application/json",
    },
    method="POST",
)

with urllib.request.urlopen(request) as response:
    print(json.loads(response.read()))
