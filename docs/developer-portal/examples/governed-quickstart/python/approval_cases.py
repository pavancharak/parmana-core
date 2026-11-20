"""
Approval cases (Python). The same five cases as ../typescript/approval-cases.ts, using the public
`parmana` package against a local server started by ../start-server.sh:

  A. No approval attached.                                  -> refused (policy condition)
  B. Approval whose ttl_seconds has passed.                 -> refused (humanApproved verified false)
  C. Approval for another target.                           -> refused (humanApproved verified false)
  D. A transaction DECLARED without its approval, executed  -> refused. An approval cannot be added later.
  E. The same request DECLARED with its approval            -> approved.

Set GOVERNED_POLICY_VERSION to the policy version in effect (default 2.1.0).

Install the SDK with its verification extra (the signers need `cryptography`):

  pip install "parmana[verify]"

Run after `node docs/developer-portal/examples/governed-quickstart/setup.mjs`, with the server
running, from any directory:

  python docs/developer-portal/examples/governed-quickstart/python/approval_cases.py

Test configuration only. The keys it reads are local secrets created by setup.mjs.
"""

from __future__ import annotations

import json
import os
import time
import uuid
from pathlib import Path
from typing import Any, Callable

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


def approval(
    approver_private_pem: str,
    *,
    resource_id: str = "vendor://payments",
    ttl_seconds: int | None = None,
) -> dict[str, Any]:
    kwargs: dict[str, Any] = {}
    if ttl_seconds is not None:
        kwargs["ttl_seconds"] = ttl_seconds
    return sign_approval(
        private_key_pem=approver_private_pem,
        approver_id="local-test-approver",
        key_id="local-test-approver-key-1",
        capability="test:fixture-execute",
        resource_id=resource_id,
        max_amount=1000,
        **kwargs,
    )


def request(transaction_id: str, approval_artifact: dict[str, Any] | None) -> Any:
    signals: dict[str, Any] = {
        "humanApproved": approval_artifact is not None,
        "vendorVerified": True,
        "invoiceVerified": True,
        "paymentApproved": True,
        "sufficientFunds": True,
        "paymentAmount": 1000,
        "riskScore": 5,
        "vendorId": "vendor://payments",
    }
    if approval_artifact is not None:
        signals["approvalArtifact"] = approval_artifact
    return create_business_transaction(
        business_transaction_id=transaction_id,
        principal_id="demo",
        purpose="Approval case",
        action="test:fixture-execute",
        target="vendor://payments",
        parameters={"amount": 1000, "currency": "USD"},
        policy=PolicyReference(
            name=POLICY_NAME, version=POLICY_VERSION, schema_version="1.0.0"
        ),
        signals=signals,
    )


def attempt(label: str, run: Callable[[], object]) -> None:
    """Run one case. A refusal from the server is reported; anything else is a failure of the example."""
    try:
        run()
    except ParmanaError as error:
        status_code = getattr(error, "status_code", None)
        print(
            f"{label}: refused ({type(error).__name__}, HTTP {status_code}): {error}"
        )
    else:
        print(f"{label}: APPROVED")


def main() -> int:
    raw_keys = json.loads((CONFIG_DIR / "raw-keys.json").read_text())
    approver_private_pem = (
        CONFIG_DIR / "local-test-approver__local-test-approver-key-1.private.pem"
    ).read_text()
    client = ParmanaClient(endpoint=ENDPOINT, api_key=raw_keys["demo"])

    attempt(
        "A. no approval attached",
        lambda: client.execute(request(str(uuid.uuid4()), None)),
    )

    short = approval(approver_private_pem, ttl_seconds=1)
    time.sleep(2.5)
    attempt(
        "B. approval expired (ttl 1s)",
        lambda: client.execute(request(str(uuid.uuid4()), short)),
    )

    other = approval(approver_private_pem, resource_id="vendor://other")
    attempt(
        "C. approval for another target",
        lambda: client.execute(request(str(uuid.uuid4()), other)),
    )

    id_d = str(uuid.uuid4())
    client.declare_transaction(request(id_d, None))
    attempt(
        "D. declared without approval, then executed",
        lambda: client.execute_transaction(id_d),
    )

    id_e = str(uuid.uuid4())
    client.declare_transaction(request(id_e, approval(approver_private_pem)))
    attempt(
        "E. declared with approval, then executed",
        lambda: client.execute_transaction(id_e),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
