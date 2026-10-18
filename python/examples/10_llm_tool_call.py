"""
Example 10

LLM Tool Call Authorization.
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
            correlation_id="llm-tool-call-demo",
            tenant_id=None,
            source_system="python-sdk-example",
            submitted_by="llm-agent",
            submitted_at=now,
        ),
        authority=Authority(
            authority_id="authority-001",
            authority_type="SERVICE",
            principal_id="llm-agent",
            display_name="LLM Agent",
            issued_at=now,
        ),
        authorization=Authorization(
            authorization_id="authorization-001",
            authority_id="authority-001",
            purpose="LLM Tool Call",
            issued_at=now,
        ),
        intent=Intent(
            intent_id="intent-001",
            authorization_id="authorization-001",
            action="ExecuteTool",
            target="github.create_pull_request",
            parameters={
                "repository": "acme/payment-service",
                "branch": "feature/ai-update",
            },
            created_at=now,
        ),
        policy=PolicyReference(
            name="llm-tool-call",
            version="1.0.0",
            schema_version="1.0.0",
        ),
        signals={
            "toolAllowed": True,
            "resourceAuthorized": True,
            "humanApproval": True,
            "riskScore": 12,
            "executionEnvironment": "production",
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
