import os

from parmana import ParmanaClient

client = ParmanaClient(
    endpoint="https://parmana-api-real.vercel.app",
    api_key=os.environ["PARMANA_API_KEY"],
)

for connector in client.list_external_connectors():
    print(connector.capability, connector.status, connector.endpoint_url)
