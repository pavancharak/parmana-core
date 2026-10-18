"""
Example 11

End-to-End SDK Workflow.

This example demonstrates the complete Parmana execution lifecycle:

1. Health Check
2. Execute Business Transaction
3. Verify Execution Trust Record
4. Replay Business Transaction
5. Generate Receipt
6. Get Business Transaction
7. Get Execution Trust Record
8. List Business Transactions
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


def print_step(title: str) -> None:
    print("\n" + "=" * 60)
    print(title)
    print("=" * 60)


def main() -> None:
    client = ParmanaClient(
        endpoint="http://localhost:3000",
    )

    print_step("Parmana SDK End-to-End")

    #
    # Health
    #
    print_step("1. Health Check")

    health = client.execution.health()

    print(
        json.dumps(
            health,
            indent=2,
            default=str,
        )
    )

    #
    # Execute
    #
    print_step("2. Execute Business Transaction")

    transaction_id = str(uuid4())
    now = datetime.now(UTC)

    transaction = BusinessTransaction(
        business_transaction_id=transaction_id,
        metadata=BusinessTransactionMetadata(
            business_transaction_id=transaction_id,
            correlation_id="end-to-end-example",
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
            purpose="End-to-End SDK Example",
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

    client.execution.execute(transaction)

    Path(__file__).with_name(".transaction_id").write_text(
        transaction_id,
        encoding="utf-8",
    )

    print(f"Business Transaction ID: {transaction_id}")

    #
    # Verify
    #
    print_step("3. Verify")

    verification = client.verification.verify(
        transaction_id,
    )

    print(
        json.dumps(
            verification.__dict__,
            indent=2,
            default=str,
        )
    )

    #
    # Replay
    #
    print_step("4. Replay")

    replay = client.replay.replay(
        transaction_id,
    )

    print(
        json.dumps(
            asdict(replay),
            indent=2,
            default=str,
        )
    )

    #
    # Receipt
    #
    print_step("5. Receipt")

    receipt = client.receipt.generate(
        transaction_id,
    )

    print(
        json.dumps(
            asdict(receipt),
            indent=2,
            default=str,
        )
    )

    #
    # Transaction
    #
    print_step("6. Transaction")

    business_transaction = client.transactions.get(
        transaction_id,
    )

    print(
        json.dumps(
            asdict(business_transaction),
            indent=2,
            default=str,
        )
    )

    #
    # Trust Record
    #
    print_step("7. Trust Record")

    execution_trust_record = client.trust_records.get(
        transaction_id,
    )

    print(
        json.dumps(
            asdict(execution_trust_record),
            indent=2,
            default=str,
        )
    )

    #
    # List Transactions
    #
    print_step("8. List Transactions")

    transactions = client.transactions.list()

    print(f"Total Transactions: {len(transactions)}")

    print(
        json.dumps(
            [asdict(t) for t in transactions],
            indent=2,
            default=str,
        )
    )

    print_step("End-to-End Completed Successfully")


if __name__ == "__main__":
    main()
