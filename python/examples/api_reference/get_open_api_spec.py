import requests

response = requests.get(
    "https://parmana-api-real.vercel.app/openapi.yaml",
    timeout=30,
)

print(response.status_code, response.text)
