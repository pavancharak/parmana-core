import os

from parmana import ParmanaClient

client = ParmanaClient(
    endpoint="https://parmana-api-real.vercel.app",
    api_key=os.environ["PARMANA_API_KEY"],
)

for change in client.authority_grant_changes("PENDING_APPROVAL"):
    print(change.change_id, change.action, change.caller_id, change.capability)
