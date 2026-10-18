import os
from pathlib import Path

from parmana import ParmanaClient
from parmana.crypto import sign_policy_change_step_up

client = ParmanaClient(
    endpoint="https://parmana-api-real.vercel.app",
    api_key=os.environ["PARMANA_API_KEY"],
)

step_up = sign_policy_change_step_up(
    pending_policy_change_id="9f3cf733-a8ed-487c-bb58-a53950388cdf",
    action="reject",
    private_key_pem=Path("step-up.private.pem").read_text(),
    key_id="checker-step-up-1",
)

change = client.reject_authority_grant_change(
    "9f3cf733-a8ed-487c-bb58-a53950388cdf",
    "Lower the limit to 50000 first.",
    step_up,
)

print(change.status)
