from __future__ import annotations

from datetime import UTC, datetime

from parmana import (
    Authority,
    Authorization,
    BusinessTransaction,
    BusinessTransactionMetadata,
    Intent,
    PolicyReference,
)
from parmana.serialization import encode


def test_encode_business_transaction():

    now = datetime.now(UTC)

    transaction = BusinessTransaction(
        business_transaction_id="tx-001",
        metadata=BusinessTransactionMetadata(
            business_transaction_id="tx-001",
            correlation_id="corr-001",
            tenant_id=None,
            source_system="pytest",
            submitted_by="tester",
            submitted_at=now,
        ),
        authority=Authority(
            authority_id="authority-001",
            authority_type="SERVICE",
            principal_id="pytest",
            display_name="PyTest",
            issued_at=now,
        ),
        authorization=Authorization(
            authorization_id="authz-001",
            authority_id="authority-001",
            purpose="Unit Test",
            issued_at=now,
        ),
        intent=Intent(
            intent_id="intent-001",
            authorization_id="authz-001",
            action="TestAction",
            target="resource/1",
            parameters={"amount": 100},
            created_at=now,
        ),
        policy=PolicyReference(
            name="policy",
            version="1.0.0",
            schema_version="1.0.0",
        ),
        signals={
            "approved": True,
        },
        status="RECEIVED",
        created_at=now,
    )

    payload = encode(transaction)

    assert payload["businessTransactionId"] == "tx-001"

    assert payload["metadata"]["correlationId"] == "corr-001"

    # Regression: encode() previously used dataclasses.asdict(), which
    # flattens every nested dataclass into a plain dict before this
    # function's own None-filtering ever runs on it -- so an unset
    # nested optional field (tenant_id=None here) was sent as an
    # explicit JSON null instead of being omitted, unlike an unset
    # *top-level* optional field. Runtime treats "key absent" and "key
    # present with value null" differently (e.g.
    # DefaultConnectorPolicy.assertAllowed's grantedCapability check),
    # so this must stay omitted at every nesting depth, not just the
    # top one.
    assert "tenantId" not in payload["metadata"]
    assert "grantedCapability" not in payload["metadata"]

    assert payload["authority"]["authorityId"] == "authority-001"

    assert payload["authorization"]["authorizationId"] == "authz-001"

    assert payload["intent"]["intentId"] == "intent-001"

    assert payload["policy"]["schemaVersion"] == "1.0.0"

    assert payload["signals"]["approved"] is True

    assert isinstance(
        payload["createdAt"],
        str,
    )
