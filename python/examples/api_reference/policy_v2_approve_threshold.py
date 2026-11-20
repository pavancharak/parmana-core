# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Approve a threshold
import os
import urllib.request

request = urllib.request.Request(
    "https://parmana-api-real.vercel.app/v2/register/thresholds/erp:pay-invoice/max-amount/approve",
    data=None,
    method="POST",
    headers={"Authorization": f"Bearer {os.environ.get('PARMANA_API_KEY', '')}"},
)
with urllib.request.urlopen(request) as response:
    print(response.status, response.read().decode("utf-8"))
