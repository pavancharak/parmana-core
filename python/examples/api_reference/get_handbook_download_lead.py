import requests

response = requests.get(
    "https://parmana-api-real.vercel.app/handbook/download-leads?email=reader%40example.com",
    timeout=30,
)

print(response.status_code, response.json())
