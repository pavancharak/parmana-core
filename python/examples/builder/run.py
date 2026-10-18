"""
Builder quickstart.

The same POST /execute flow as examples/quickstart/run.py, built with
create_business_transaction() instead of constructing all five nested
dataclasses and keeping three id pairs in sync by hand. Compare this
file to examples/quickstart/run.py directly -- the difference is the
entire point: every "X must match Y" 400 response documented in
docs/site/guides/end-to-end-paytm-flow.mdx came from hand-building a request and
getting one of those pairs wrong. This function makes that class of
mistake structurally impossible.

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


def run_builder_example(
    endpoint: str = "http://localhost:3000",
    approval: dict[str, Any] | None = None,
) -> ExecutionTrustRecord:
    """
    Constructs a ParmanaClient, builds a Business Transaction with
    create_business_transaction(), submits it, and returns the
    resulting Execution Trust Record. Exported (rather than only run
    as a top-level script) so
    tests/test_builder_example.py can prove this exact example
    actually works against a real running server, not just that it
    compiles.
    """

    client = ParmanaClient(endpoint=endpoint)

    print(f"Connected to {client.endpoint} (SDK v{client.version})")

    # test:fixture-execute, the same NODE_ENV=test-only capability
    # examples/quickstart/run.py uses, so this example is hermetic and
    # runs against any local server with no external connector
    # configured. To see this reach a real business system (Paytm,
    # staging), swap action/target/parameters/policy for the real
    # paytm:refund shape -- see
    # docs/site/guides/end-to-end-paytm-flow.mdx
    # (repo root) for the complete, verified-live version of exactly
    # that.
    transaction = create_business_transaction(
        principal_id="python-sdk",
        display_name="Python SDK Builder Quickstart",
        purpose="Builder quickstart demo",
        action="test:fixture-execute",
        target="vendor://payments",
        parameters={
            "amount": 1000,
            "currency": "USD",
        },
        policy=PolicyReference(
            name="vendor-payment",
            version="2.1.0",
            schema_version="1.0.0",
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
            # vendor-payment@2.1.0 declares boundSignals: { "vendorId": "target" }.
            # SignalIntentBinder rejects this transaction unless this signal exactly
            # equals intent.target, checked before policy evaluation ever runs (see
            # docs/VERIFICATION-GAPS.md G-24).
            "vendorId": "vendor://payments",
        },
        source_system="python-sdk-builder-example",
        submitted_by="sdk-demo",
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
    run_builder_example(approval=_approval_from_env())


if __name__ == "__main__":
    main()
