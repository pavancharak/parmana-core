import os
from pathlib import Path

from parmana import ParmanaClient
from parmana.crypto import sign_policy_change_step_up

client = ParmanaClient(
    endpoint="https://parmana-api-real.vercel.app",
    api_key=os.environ["PARMANA_API_KEY"],
)

step_up = sign_policy_change_step_up(
    pending_policy_change_id="5ba7d3a6-d56d-4e90-b588-402d44aeee0c",
    action="approve",
    private_key_pem=Path("step-up.private.pem").read_text(),
    key_id="checker-step-up-1",
)

change = client.approve_business_signal_source_change(
    "5ba7d3a6-d56d-4e90-b588-402d44aeee0c", step_up
)

print(change.status)
