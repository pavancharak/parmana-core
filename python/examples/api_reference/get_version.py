import os

import requests

response = requests.get(
    "https://parmana-api-real.vercel.app/version",
    headers={"Authorization": f"Bearer {os.environ['PARMANA_API_KEY']}"},
    timeout=30,
)

print(response.status_code, response.json())
