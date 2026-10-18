from pathlib import Path

import requests

response = requests.get(
    "https://parmana-api-real.vercel.app/parmana-handbook.pdf", timeout=30
)

Path("parmana-handbook.pdf").write_bytes(response.content)
