import json
import os
from pathlib import Path

from parmana import ParmanaClient

client = ParmanaClient(
    endpoint="https://parmana-api-real.vercel.app",
    api_key=os.environ["PARMANA_API_KEY"],
)

change = client.propose_policy_change(
    "customer-refund",
    "1.3.0",
    proposed_content=json.loads(
        Path("policies/customer-refund/1.3.0/policy.json").read_text()
    ),
    reason="Raise the maximum refund to 150000.",
)

print(change.pending_policy_change_id)
