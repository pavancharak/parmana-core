"""
Content binding (from the client's perspective).

Submits a Business Transaction, then attempts to resubmit a MODIFIED
transaction under the same businessTransactionId, and reports exactly
what the Runtime does about it.

IMPORTANT -- read README.md in this directory before drawing conclusions
from the output. What this example observes is Business Transaction ID
uniqueness, NOT cryptographic content-binding (verifying a
SignedExecutionAuthorization's businessTransactionHash against the
actual submitted content). The plain local API server does not perform
that check; see the README for why and what would be required.
"""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from parmana import (
    Authority,
    Authorization,
    BusinessTransaction,
    BusinessTransactionMetadata,
    ConflictError,
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


def _build_transaction(
    transaction_id: str,
    *,
    amount: int,
    action: str,
) -> BusinessTransaction:
    now = datetime.now(UTC)

    return BusinessTransaction(
        business_transaction_id=transaction_id,
        metadata=BusinessTransactionMetadata(
            business_transaction_id=transaction_id,
            correlation_id="content-binding-example",
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
            purpose="Content binding example",
            issued_at=now,
        ),
        intent=Intent(
            intent_id="intent-001",
            authorization_id="authorization-001",
            action=action,
            target="vendor/V-100",
            parameters={"amount": amount, "currency": "USD"},
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
            "invoiceVerified": True,
            "paymentApproved": True,
            "sufficientFunds": True,
            "paymentAmount": amount,
            "riskScore": 5,
        },
        status="RECEIVED",
        created_at=now,
    )


def main() -> None:
    client = ParmanaClient(endpoint="http://localhost:3000")

    transaction_id = str(uuid4())

    original = _build_transaction(transaction_id, amount=1000, action="VendorPayment")

    trust_record = client.execution.execute(original)
    print(f"Original transaction accepted: {transaction_id}")
    print(f"  amount authorized: {original.intent.parameters['amount']}")
    print(f"  trust record hash: {trust_record.trust_record_hash}\n")

    #
    # Same businessTransactionId, but the payment amount (content) has
    # been changed after the fact -- as if an attacker or a buggy caller
    # tried to slip a different amount through under the same ID.
    #
    modified = _build_transaction(transaction_id, amount=50000, action="VendorPayment")

    print(
        f"Resubmitting SAME businessTransactionId with amount changed to "
        f"{modified.intent.parameters['amount']} ..."
    )

    try:
        client.execution.execute(modified)
        print("!! Modified transaction was ACCEPTED. No protection observed.")
    except ConflictError as exc:
        print(f"Rejected: {exc} (HTTP {exc.status_code})")
        print(
            "\nThis is Business Transaction ID uniqueness "
            "(DuplicateBusinessTransactionError), NOT cryptographic "
            "content-binding. See README.md for what that distinction "
            "means and what would be required to observe real "
            "content-binding enforcement."
        )


if __name__ == "__main__":
    main()
