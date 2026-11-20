# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Take an action live, if its gate is met
import os
import urllib.request

request = urllib.request.Request(
    "https://parmana-api-real.vercel.app/v2/register/actions/erp:pay-invoice/go-live",
    data=None,
    method="POST",
    headers={"Authorization": f"Bearer {os.environ.get('PARMANA_API_KEY', '')}"},
)
with urllib.request.urlopen(request) as response:
    print(response.status, response.read().decode("utf-8"))
