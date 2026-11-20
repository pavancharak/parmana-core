# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Read a review
import os
import urllib.request

request = urllib.request.Request(
    "https://parmana-api-real.vercel.app/v2/reviews/review-123",
    data=None,
    method="GET",
    headers={"Authorization": f"Bearer {os.environ.get('PARMANA_API_KEY', '')}"},
)
with urllib.request.urlopen(request) as response:
    print(response.status, response.read().decode("utf-8"))
