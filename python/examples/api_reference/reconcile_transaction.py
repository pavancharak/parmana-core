import os

from parmana import ParmanaClient

# Operator credentials only: a plain API key is refused with 403.
client = ParmanaClient(
    endpoint="https://parmana-api-real.vercel.app",
    api_key=os.environ["PARMANA_OPERATOR_KEY"],
)

result = client.reconcile_transaction("6f6582a1-4e1a-4800-a73b-cb4c3aa32110")

print(result.status, result.changed)
