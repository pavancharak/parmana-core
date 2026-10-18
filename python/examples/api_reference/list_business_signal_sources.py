import os

from parmana import ParmanaClient

client = ParmanaClient(
    endpoint="https://parmana-api-real.vercel.app",
    api_key=os.environ["PARMANA_API_KEY"],
)

for source in client.list_business_signal_sources():
    print(source.name, source.status, source.endpoint_url)
