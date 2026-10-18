"""
Example 02

Execute a Business Transaction.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from parmana import (
    Authority,
    Authorization,
    BusinessTransaction,
    BusinessTransactionMetadata,
    Intent,
    ParmanaClient,
    PolicyReference,
)


def _approval_from_env() -> dict[str, Any] | None:
    """
    The signed approval, as JSON, from the file PARMANA_APPROVAL_FILE names.

    No agent action is authorized without a signed human approval. A
    trusted approver signs one for this target and amount (for example
    with scripts/sign-approval.ts, or parmana.crypto.sign_approval) and
    the agent attaches it. Without it the server refuses the transaction.
    """

    path = os.environ.get("PARMANA_APPROVAL_FILE")
    return None if path is None else json.loads(Path(path).read_text())


def main() -> None:
    client = ParmanaClient(
        endpoint="http://localhost:3000",
    )

    #
    # Generate a unique Business Transaction ID.
    #
    transaction_id = str(uuid4())

    #
    # Current UTC timestamp.
    #
    now = datetime.now(UTC)

    transaction = BusinessTransaction(
        business_transaction_id=transaction_id,
        metadata=BusinessTransactionMetadata(
            business_transaction_id=transaction_id,
            correlation_id="demo-execution",
            tenant_id=None,
            source_system="python-sdk-example",
            submitted_by="sdk-demo",
            submitted_at=now,
        ),
        authority=Authority(
            authority_id="authority-001",
            authority_type="SERVICE",
            principal_id="python-sdk",
            display_name="Python SDK",
            issued_at=now,
        ),
        authorization=Authorization(
            authorization_id="authorization-001",
            authority_id="authority-001",
            purpose="Execute demo transaction",
            issued_at=now,
        ),
        intent=Intent(
            intent_id="intent-001",
            authorization_id="authorization-001",
            action="VendorPayment",
            target="vendor/V-100",
            parameters={
                "amount": 1000,
                "currency": "USD",
            },
            created_at=now,
        ),
        policy=PolicyReference(
            name="vendor-payment",
            version="2.1.0",
            schema_version="1.0.0",
        ),
        signals={
            "humanApproved": True,
            "approvalArtifact": _approval_from_env(),
            "vendorVerified": True,
            "paymentApproved": True,
            "amount": 1000,
        },
        status="RECEIVED",
        created_at=now,
    )

    trust_record = client.execution.execute(transaction)

    #
    # Save the transaction ID for later examples.
    #
    Path(__file__).with_name(".transaction_id").write_text(
        transaction_id,
        encoding="utf-8",
    )

    print(f"\nBusiness Transaction ID: {transaction_id}\n")

    print(
        json.dumps(
            asdict(trust_record),
            indent=2,
            default=str,
        )
    )


if __name__ == "__main__":
    main()
