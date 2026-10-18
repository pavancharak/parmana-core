import requests

response = requests.post(
    "https://parmana-api-real.vercel.app/handbook/download-leads",
    json={"email": "reader@example.com"},
    timeout=30,
)

print(response.status_code, response.json())
