from __future__ import annotations

from datetime import UTC, datetime

from parmana.api.trust_record_api import TrustRecordApi
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
                value="c2ln",
                signed_at=datetime.now(UTC),
            ),
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )


def test_get():
    transport = FakeTransport()

    api = TrustRecordApi(transport)

    record = api.get("tx-001")

    assert transport.called
    assert transport.method == "GET"
    assert transport.path == "/trust-records/tx-001"
    assert transport.response_model is ExecutionTrustRecord

    assert isinstance(record, ExecutionTrustRecord)
