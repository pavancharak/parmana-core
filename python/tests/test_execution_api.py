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
from parmana.serialization import encode


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
        non_throwing_statuses=frozenset(),
    ):
        self.called = True
        self.method = method
        self.path = path
        self.body = body
        self.response_model = response_model
        self.non_throwing_statuses = non_throwing_statuses


        record = ExecutionTrustRecord(
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
        if non_throwing_statuses:
            # The API decodes the wire payload: round-trip the record.
            return encode(record)
        return record


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

    assert transport.non_throwing_statuses == frozenset({202})

    assert isinstance(
        record,
        ExecutionTrustRecord,
    )

    assert record.signature.algorithm == SignatureAlgorithm.ED25519


def test_execute_raises_execution_pending_on_the_202_answer(monkeypatch):
    import pytest

    import parmana.api.execution_api as module
    from parmana.errors import ExecutionPendingError

    monkeypatch.setattr(
        module,
        "decode",
        lambda payload, model: ("decoded", model, payload),
    )
    monkeypatch.setattr(module, "encode", lambda value: value)

    class PendingTransport(FakeTransport):
        def send(self, **kwargs):
            self.called = True
            return {
                "businessTransactionId": "tx-001",
                "status": "EXECUTING",
                "outcome": "pending",
                "reconcile": "/transactions/tx-001/reconcile",
                "record": {"trustRecordId": "tr-001"},
            }

    api = ExecutionApi(PendingTransport())
    transaction = None

    with pytest.raises(ExecutionPendingError) as raised:
        api.execute(transaction)

    assert raised.value.code == "EXECUTION_STATUS_PENDING"
    assert raised.value.business_transaction_id == "tx-001"
    assert raised.value.reconcile_path == "/transactions/tx-001/reconcile"
