"""
Quickstart.

Construct a ParmanaClient, submit a Business Transaction, and receive
the resulting Execution Trust Record.

See README.md in this directory for prerequisites and expected output.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict
from pathlib import Path
from typing import Any

from parmana import (
    ExecutionTrustRecord,
    ParmanaClient,
    PolicyReference,
    create_business_transaction,
)


def run_quickstart(
    endpoint: str = "http://localhost:3000",
    approval: dict[str, Any] | None = None,
) -> ExecutionTrustRecord:
    """
    Constructs a ParmanaClient, submits a Business Transaction, and
    returns the resulting Execution Trust Record. Exported (rather than
    only run as a top-level script) so
    tests/test_quickstart_example.py can prove this exact example
    actually works against a real running server, not just that it
    compiles.
    """

    client = ParmanaClient(endpoint=endpoint)

    print(f"Connected to {client.endpoint} (SDK v{client.version})")

    # test:fixture-execute is a generic, test-only connector
    # (NODE_ENV=test only, no credentials needed) built for exactly this
    # walkthrough. The policy name "vendor-payment" is unrelated to any
    # connector, it's just the name of the example policy this
    # transaction is evaluated against.
    transaction = create_business_transaction(
        principal_id="python-sdk",
        purpose="Quickstart demo",
        action="test:fixture-execute",
        target="vendor://payments",
        parameters={"amount": 1000, "currency": "USD"},
        policy=PolicyReference(
            name="vendor-payment", version="2.1.0", schema_version="1.0.0"
        ),
        signals={
            # No agent action is authorized without a signed human approval.
            # A trusted approver signs one for this target and amount (for
            # example through the approval email) and the agent attaches it.
            # Without it the server refuses the transaction.
            "humanApproved": True,
            "approvalArtifact": approval,
            "vendorVerified": True,
            "invoiceVerified": True,
            "paymentApproved": True,
            "sufficientFunds": True,
            "paymentAmount": 1000,
            "riskScore": 5,
            # vendor-payment@2.1.0 declares boundSignals: { "vendorId": "target" },
            # this must exactly equal intent.target, checked before policy
            # evaluation ever runs.
            "vendorId": "vendor://payments",
        },
    )

    trust_record = client.execution.execute(transaction)

    print(f"\nBusiness Transaction ID: {transaction.business_transaction_id}")
    print(f"Trust Record ID:         {trust_record.trust_record_id}")
    print(f"Trust Record Hash:       {trust_record.trust_record_hash}")
    print(f"Signature Algorithm:     {trust_record.signature.algorithm}")

    print("\nFull Execution Trust Record:")
    print(json.dumps(asdict(trust_record), indent=2, default=str))

    return trust_record


def _approval_from_env() -> dict[str, Any] | None:
    """The signed approval, as JSON, from the file PARMANA_APPROVAL_FILE names."""

    path = os.environ.get("PARMANA_APPROVAL_FILE")
    return None if path is None else json.loads(Path(path).read_text())


def main() -> None:
    run_quickstart(approval=_approval_from_env())


if __name__ == "__main__":
    main()
