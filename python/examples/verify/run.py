"""
Verify.

Submits a Business Transaction, then demonstrates both Verification
entry points:

- `client.verification.verify(...)`      -> POST /verify   (fresh)
- `client.verification.get_latest(...)`  -> GET /verification/:id (cached)

See README.md in this directory for prerequisites and expected output.
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
    client = ParmanaClient(endpoint="http://localhost:3000")

    transaction_id = str(uuid4())
    now = datetime.now(UTC)

    transaction = BusinessTransaction(
        business_transaction_id=transaction_id,
        metadata=BusinessTransactionMetadata(
            business_transaction_id=transaction_id,
            correlation_id="verify-example",
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
            purpose="Verify example",
            issued_at=now,
        ),
        intent=Intent(
            intent_id="intent-001",
            authorization_id="authorization-001",
            action="VendorPayment",
            target="vendor/V-100",
            parameters={"amount": 1000, "currency": "USD"},
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
            "paymentAmount": 1000,
            "riskScore": 5,
        },
        status="RECEIVED",
        created_at=now,
    )

    client.execution.execute(transaction)
    print(f"Business Transaction ID: {transaction_id}\n")

    #
    # POST /verify -- runs a fresh verification, appends a new
    # Verification to the Trust Record's history.
    #
    fresh = client.verification.verify(transaction_id)
    print("client.verification.verify() -- fresh (POST /verify):")
    print(f"  status:      {fresh.status}")
    print(f"  verified_at: {fresh.verified_at}")
    print(f"  hash:        {fresh.trust_record_hash}\n")

    #
    # GET /verification/:id -- reads back the latest Verification
    # without re-verifying. This method did not exist in the SDK before
    # this session; verify() was the only entry point, conflating fresh
    # verification with a cached read.
    #
    cached = client.verification.get_latest(transaction_id)
    print("client.verification.get_latest() -- cached (GET /verification/:id):")
    print(f"  status:      {cached.status}")
    print(f"  verified_at: {cached.verified_at}")
    print(f"  hash:        {cached.trust_record_hash}\n")

    assert cached.verification_id == fresh.verification_id
    print(
        "Confirmed: get_latest() returned the same Verification verify() just produced."
    )


if __name__ == "__main__":
    main()
