import json
import os
from pathlib import Path

from parmana import ParmanaClient, create_business_transaction

client = ParmanaClient(
    endpoint="https://parmana-api-real.vercel.app",
    api_key=os.environ["PARMANA_API_KEY"],
)

in_effect = client.policy_in_effect("paytm:refund")

# The signed approval the approver sent, for this order and up to this amount.
approval = json.loads(Path("approval.json").read_text())

transaction = create_business_transaction(
    principal_id=client.caller().caller_id,
    purpose="Refund order ORD-1042",
    action="paytm:refund",
    target="ORD-1042",
    parameters={"orderId": "ORD-1042", "transactionId": "TXN-9", "amount": 750},
    policy=in_effect.policy,
    signals={
        "refundEligible": True,
        "fraudCheckPassed": True,
        "refundAmount": 750,
        "managerApproved": True,
        "approvalArtifact": approval,
    },
)

record = client.execute(transaction)

print(record.business_transaction_id, record.executions[0].decision.outcome)
