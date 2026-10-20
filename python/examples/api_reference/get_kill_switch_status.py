import json
import os
import urllib.request

request = urllib.request.Request(
    "https://your-parmana-server/kill-switch/status?nonce=check-1",
    headers={"Authorization": f"Bearer {os.environ.get('PARMANA_API_KEY', '')}"},
)

with urllib.request.urlopen(request) as response:
    print(json.loads(response.read()))
