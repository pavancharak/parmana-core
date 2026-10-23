import os
import time

import requests
from parmana import ParmanaClient, ExecutionRejectedError, PolicyReference, create_business_transaction
from parmana.crypto.offline_verifier import verify_execution_trust_record_offline

PARMANA_URL = "https://parmana-sandbox.vercel.app"
PARMANA_API_KEY = os.environ["PARMANA_API_KEY"]  # the sandbox demo key
HEADERS = {"Authorization": f"Bearer {PARMANA_API_KEY}"}

client = ParmanaClient(endpoint=PARMANA_URL, api_key=PARMANA_API_KEY, timeout=120)

# 1. Who am I? The demo key may ask for sandbox:receipt only.
me = client.caller()
print("1.", me.caller_id, me.allowed_capabilities)

# 2. What must a request carry? Ask the server for the policy in effect.
in_effect = requests.get(
    f"{PARMANA_URL}/policies/in-effect",
    params={"capability": "sandbox:receipt"},
    headers=HEADERS,
    timeout=30,
).json()
print("2.", in_effect["policy"], in_effect["signals"])
policy = PolicyReference(
    name=in_effect["policy"]["name"],
    version=in_effect["policy"]["version"],
    schema_version=in_effect["policy"]["schemaVersion"],
)

target = f"my-first-receipt-{int(time.time() * 1000)}"


def request(note, signals):
    return create_business_transaction(
        principal_id=me.caller_id,
        purpose="Trying the Parmana sandbox",
        action="sandbox:receipt",
        target=target,
        parameters={"note": note},
        policy=policy,
        signals={"note": note, **signals},
    )


# 3. Without an approval, the policy refuses.
try:
    client.execute(request("hello", {"receiptApproved": False}))
except ExecutionRejectedError as error:
    print("3. refused:", error)

# 4. Get a signed approval for this target from the sandbox's demo approver.
approval = requests.post(
    f"{PARMANA_URL}/sandbox/approvals",
    json={"capability": "sandbox:receipt", "resourceId": target},
    headers=HEADERS,
    timeout=30,
).json()
print("4. approval expires", approval["payload"]["expiresAt"])

# 5. With the approval, the request is approved and released.
record = client.execute(request("hello", {"receiptApproved": True, "approvalArtifact": approval}))
print("5.", record.executions[0].decision.outcome, record.business_transaction_id)

# 6. Verify the signed record offline, with the sandbox's public key only.
#    Pass the record as the server sent it (plain JSON): in parmana 1.4.0 and earlier the
#    decoded model drops a null previousChainHash, so it fails to verify.
pem = client.public_key("default").pem
raw_record = requests.get(
    f"{PARMANA_URL}/trust-records/{record.business_transaction_id}",
    headers=HEADERS,
    timeout=30,
).json()
print("6. verifies offline:", verify_execution_trust_record_offline(raw_record, {"default": pem}).valid)

# 7. The same approval again is refused: an approval is used once.
try:
    client.execute(request("again", {"receiptApproved": True, "approvalArtifact": approval}))
except ExecutionRejectedError as error:
    print("7. refused:", error)
