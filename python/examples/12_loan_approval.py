"""
Example 12

Loan Approval.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
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


def main() -> None:
    client = ParmanaClient(
        endpoint="http://localhost:3000",
    )

    transaction_id = str(uuid4())
    now = datetime.now(UTC)

    transaction = BusinessTransaction(
        business_transaction_id=transaction_id,
        metadata=BusinessTransactionMetadata(
            business_transaction_id=transaction_id,
            correlation_id="loan-approval-demo",
            tenant_id=None,
            source_system="python-sdk-example",
            submitted_by="loan-officer",
            submitted_at=now,
        ),
        authority=Authority(
            authority_id="authority-001",
            authority_type="SERVICE",
            principal_id="loan-engine",
            display_name="Loan Processing Engine",
            issued_at=now,
        ),
        authorization=Authorization(
            authorization_id="authorization-001",
            authority_id="authority-001",
            purpose="Loan Approval",
            issued_at=now,
        ),
        intent=Intent(
            intent_id="intent-001",
            authorization_id="authorization-001",
            action="ApproveLoan",
            target="loan/LN-1001",
            parameters={
                "customerId": "CUST-1001",
                "loanAmount": 500000,
                "currency": "INR",
                "tenureMonths": 60,
            },
            created_at=now,
        ),
        policy=PolicyReference(
            name="loan-approval",
            version="1.0.0",
            schema_version="1.0.0",
        ),
        signals={
            "creditScore": 782,
            "incomeVerified": True,
            "kycCompleted": True,
            "existingDefaults": False,
            "debtToIncomeRatio": 0.32,
        },
        status="RECEIVED",
        created_at=now,
    )

    trust_record = client.execution.execute(transaction)

    Path(__file__).with_name(".transaction_id").write_text(
        transaction_id,
        encoding="utf-8",
    )

    print(
        json.dumps(
            asdict(trust_record),
            indent=2,
            default=str,
        )
    )


if __name__ == "__main__":
    main()
