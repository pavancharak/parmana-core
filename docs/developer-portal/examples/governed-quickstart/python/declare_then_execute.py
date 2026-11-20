"""
Declare, check status, then execute (Python). The same flow as
../typescript/declare-then-execute.ts, using the public `parmana` package against a local
server started by ../start-server.sh:

  1. declare_transaction(): POST /transactions. Recorded as RECEIVED. Nothing is decided or released.
  2. transaction_status(): GET /transactions/{id}/status. Shows the recorded lifecycle.
  3. execute_transaction(): POST /transactions/{id}/execute. Policy is evaluated and the action is
     released only when it is approved. The result is the signed Execution Trust Record.
  4. transaction_status(history=True) again, to show the events after execution.

Policy version: the server executes only the version in effect, which is the one most recently
approved for the policy name. governed_flow.py approves 2.1.0. Set GOVERNED_POLICY_VERSION to the
version in effect (default 2.1.0).

Install the SDK with its verification extra (the signers need `cryptography`):

  pip install "parmana[verify]"

Run after `node docs/developer-portal/examples/governed-quickstart/setup.mjs`, with the server
running, from any directory:

  python docs/developer-portal/examples/governed-quickstart/python/declare_then_execute.py

Test configuration only. The keys it reads are local secrets created by setup.mjs.
"""

from __future__ import annotations

import json
import os
import sys
import uuid
from pathlib import Path

from parmana import (
    ParmanaClient,
    ParmanaError,
    PolicyReference,
    create_business_transaction,
)
from parmana.crypto import sign_approval

CONFIG_DIR = Path(
    os.environ.get(
        "GOVERNED_CONFIG_DIR", str(Path.home() / ".parmana" / "governed-quickstart")
    )
)
ENDPOINT = os.environ.get("PARMANA_ENDPOINT", "http://localhost:3000")
POLICY_NAME = "vendor-payment"
POLICY_VERSION = os.environ.get("GOVERNED_POLICY_VERSION", "2.1.0")


def value_of(enum_or_text: object) -> str:
    """Enum members print as their value, not as the class name."""
    return str(getattr(enum_or_text, "value", enum_or_text))


def main() -> int:
    raw_keys = json.loads((CONFIG_DIR / "raw-keys.json").read_text())
    approver_private_pem = (
        CONFIG_DIR / "local-test-approver__local-test-approver-key-1.private.pem"
    ).read_text()
    client = ParmanaClient(endpoint=ENDPOINT, api_key=raw_keys["demo"])

    business_transaction_id = str(uuid.uuid4())
    approval = sign_approval(
        private_key_pem=approver_private_pem,
        approver_id="local-test-approver",
        key_id="local-test-approver-key-1",
        capability="test:fixture-execute",
        resource_id="vendor://payments",
        max_amount=250,
    )
    transaction = create_business_transaction(
        business_transaction_id=business_transaction_id,
        principal_id="demo",
        purpose="Declare then execute",
        action="test:fixture-execute",
        target="vendor://payments",
        parameters={"amount": 250, "currency": "USD"},
        policy=PolicyReference(
            name=POLICY_NAME, version=POLICY_VERSION, schema_version="1.0.0"
        ),
        signals={
            "humanApproved": True,
            "approvalArtifact": approval,
            "vendorVerified": True,
            "invoiceVerified": True,
            "paymentApproved": True,
            "sufficientFunds": True,
            "paymentAmount": 250,
            "riskScore": 5,
            "vendorId": "vendor://payments",
        },
    )

    print(f"1. declare {business_transaction_id}")
    declared = client.declare_transaction(transaction)
    print(f"   status: {value_of(declared.status)}")

    print("2. status")
    status = client.transaction_status(business_transaction_id)
    print(f"   current: {value_of(status.current.status)} (stage {status.current.stage})")

    print("3. execute")
    record = client.execute_transaction(business_transaction_id)
    print(f"   trust record: {record.trust_record_id}")
    print(f"   outcome: {value_of(record.executions[0].decision.outcome)}")

    after = client.transaction_status(business_transaction_id, history=True)
    events = len(after.history or [])
    print(
        f"4. status after execution: {value_of(after.current.status)} "
        f"({events} events in history)"
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ParmanaError as error:
        status_code = getattr(error, "status_code", None)
        suffix = f" (HTTP {status_code})" if status_code else ""
        print(f"{type(error).__name__}{suffix}: {error}", file=sys.stderr)
        sys.exit(1)
