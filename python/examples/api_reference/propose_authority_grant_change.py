import os

from parmana import ParmanaClient

client = ParmanaClient(
    endpoint="https://parmana-api-real.vercel.app",
    api_key=os.environ["PARMANA_API_KEY"],
)

change = client.authority_grants.propose_grant(
    caller_id="warehouse-agent",
    capability="erp:release-goods",
    limits={
        "parameters.amount": {"max": 100000},
        "parameters.currency": {"oneOf": ["INR"]},
    },
    valid_until="2026-12-30T00:00:00.000Z",
    reason=(
        "The warehouse agent releases goods for paid invoices up to 100000 INR "
        "this quarter."
    ),
)

print(change.change_id)
