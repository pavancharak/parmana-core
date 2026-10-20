import os
from pathlib import Path

from parmana import ParmanaClient

client = ParmanaClient(
    endpoint="https://parmana-api-real.vercel.app",
    api_key=os.environ["PARMANA_API_KEY"],
)

change = client.approvers.propose_add(
    approver_id="approver-example",
    key_id="approver-example-key-1",
    public_key_pem=Path(
        "approver-example__approver-example-key-1.public.pem"
    ).read_text(),
    reason="The example approver approves refunds for the West region from October.",
)

print(change.change_id)
