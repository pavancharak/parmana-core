import requests

response = requests.get(
    "https://parmana-api-real.vercel.app/ready",
    timeout=30,
)

print(response.status_code, response.json())
