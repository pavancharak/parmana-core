# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Approve an approver key
import os
import urllib.request

request = urllib.request.Request(
    "https://parmana-api-real.vercel.app/v2/register/approver-keys/approver-7/key-2026-01/approve",
    data=None,
    method="POST",
    headers={"Authorization": f"Bearer {os.environ.get('PARMANA_API_KEY', '')}"},
)
with urllib.request.urlopen(request) as response:
    print(response.status, response.read().decode("utf-8"))
