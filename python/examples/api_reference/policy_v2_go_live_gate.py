# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# List what is missing before go-live
import os
import urllib.request

request = urllib.request.Request(
    "https://parmana-api-real.vercel.app/v2/register/actions/erp:pay-invoice/go-live",
    data=None,
    method="GET",
    headers={"Authorization": f"Bearer {os.environ.get('PARMANA_API_KEY', '')}"},
)
with urllib.request.urlopen(request) as response:
    print(response.status, response.read().decode("utf-8"))
