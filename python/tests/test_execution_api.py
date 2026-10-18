from __future__ import annotations

from datetime import UTC, datetime

from parmana.api.execution_api import ExecutionApi
from parmana.models.authority import Authority
from parmana.models.authorization import Authorization
from parmana.models.business_transaction import (
    BusinessTransaction,
    BusinessTransactionMetadata,
)
from parmana.models.intent import Intent
from parmana.models.policy import PolicyReference
from parmana.models.signature import Signature, SignatureAlgorithm
from parmana.models.trust_record import ExecutionTrustRecord


class FakeTransport:
    def __init__(self):
        self.called = False
        self.method = None
        self.path = None
        self.body = None
        self.response_model = None

    def send(
        self,
        *,
        method,
        path,
        body=None,
        response_model=None,
    ):
        self.called = True
        self.method = method
        self.path = path
        self.body = body
        self.response_model = response_model

        return ExecutionTrustRecord(
            trust_record_id="tr-001",
            business_transaction_id="tx-001",
            transaction=None,
            overrides=[],
            executions=[],
            verifications=[],
            receipts=[],
            trust_record_hash="hash",
            signature=Signature(
                algorithm=SignatureAlgorithm.ED25519,
                key_id="key-001",
                value="c2lnbmF0dXJl",
                signed_at=datetime.now(UTC),
            ),
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )


def test_execute():

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
            action="VendorPayment",
            target="vendor/1",
            parameters={},
            created_at=now,
        ),
        policy=PolicyReference(
            name="policy",
            version="1.0.0",
            schema_version="1.0.0",
        ),
        signals={},
        status="RECEIVED",
        created_at=now,
    )

    transport = FakeTransport()

    api = ExecutionApi(
        transport,
    )

    record = api.execute(transaction)

    assert transport.called

    assert transport.method == "POST"

    assert transport.path == "/execute"

    assert transport.response_model is ExecutionTrustRecord

    assert isinstance(
        record,
        ExecutionTrustRecord,
    )

    assert record.signature.algorithm == SignatureAlgorithm.ED25519
