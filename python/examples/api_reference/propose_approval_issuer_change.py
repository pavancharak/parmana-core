import os
from pathlib import Path

from parmana import ParmanaClient

client = ParmanaClient(
    endpoint="https://parmana-api-real.vercel.app",
    api_key=os.environ["PARMANA_API_KEY"],
)

change = client.approvers.propose_add(
    approver_id="manager-priya",
    key_id="manager-priya-key-1",
    public_key_pem=Path("manager-priya__manager-priya-key-1.public.pem").read_text(),
    reason="Priya approves refunds for the West region from October.",
)

print(change.change_id)
