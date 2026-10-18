# Sandbox only, and not in the SDK: a demo for trying Parmana, not part of
# the product API. Call the route directly.
import os

import requests

response = requests.post(
    "https://parmana-sandbox.vercel.app/sandbox/approvals",
    headers={"Authorization": f"Bearer {os.environ['PARMANA_API_KEY']}"},
    json={"capability": "sandbox:receipt", "resourceId": "demo-order-1"},
    timeout=30,
)

# Send it as signals.approvalArtifact within 5 minutes.
approval = response.json()

print(response.status_code, approval)
