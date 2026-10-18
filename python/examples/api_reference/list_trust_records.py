import os

from parmana import ParmanaClient

client = ParmanaClient(
    endpoint="https://parmana-api-real.vercel.app",
    api_key=os.environ["PARMANA_API_KEY"],
)

records = client.trust_records.list(page=1, page_size=25, since="2026-10-01T00:00:00Z")

print(len(records))
