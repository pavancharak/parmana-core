import os

from parmana import ParmanaClient

client = ParmanaClient(
    endpoint="https://parmana-api-real.vercel.app",
    api_key=os.environ["PARMANA_API_KEY"],
)

# Replace the id with the businessTransactionId you declared.
status = client.transaction_status(
    "6f6582a1-4e1a-4800-a73b-cb4c3aa32110",
    history=True,
)

print(status.current.status, status.current.stage)

for event in status.history or []:
    print(event.sequence, event.status, event.stage, event.occurred_at)
