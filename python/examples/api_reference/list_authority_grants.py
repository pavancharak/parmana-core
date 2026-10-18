import os

from parmana import ParmanaClient

client = ParmanaClient(
    endpoint="https://parmana-api-real.vercel.app",
    api_key=os.environ["PARMANA_API_KEY"],
)

for grant in client.list_authority_grants():
    print(grant.caller_id, grant.capability, grant.status, grant.valid_until)
