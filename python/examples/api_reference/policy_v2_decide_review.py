# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Decide a review as a reviewer
import os
import json
import urllib.request

request = urllib.request.Request(
    "https://parmana-api-real.vercel.app/v2/reviews/review-123/decision",
    data=json.dumps(json.loads(r'{"decision":"approve"}')).encode('utf-8'),
    method="POST",
    headers={"Authorization": f"Bearer {os.environ.get('PARMANA_API_KEY', '')}", "Content-Type": "application/json"},
)
with urllib.request.urlopen(request) as response:
    print(response.status, response.read().decode("utf-8"))
