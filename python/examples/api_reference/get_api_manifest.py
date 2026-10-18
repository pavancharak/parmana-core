import requests

response = requests.get(
    "https://parmana-api-real.vercel.app/api-manifest.json",
    timeout=30,
)

print(response.status_code, response.json())
