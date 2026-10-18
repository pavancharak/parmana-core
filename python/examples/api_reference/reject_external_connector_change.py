import os
from pathlib import Path

from parmana import ParmanaClient
from parmana.crypto import sign_policy_change_step_up

client = ParmanaClient(
    endpoint="https://parmana-api-real.vercel.app",
    api_key=os.environ["PARMANA_API_KEY"],
)

step_up = sign_policy_change_step_up(
    pending_policy_change_id="ba7c5827-5844-4069-94fc-9b438ef08f78",
    action="reject",
    private_key_pem=Path("step-up.private.pem").read_text(),
    key_id="checker-step-up-1",
)

change = client.reject_external_connector_change(
    "ba7c5827-5844-4069-94fc-9b438ef08f78",
    "Use the finance team's own endpoint.",
    step_up,
)

print(change.status)
