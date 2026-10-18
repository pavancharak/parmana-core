from __future__ import annotations

from datetime import UTC, datetime

from parmana.api.receipt_api import ReceiptApi
from parmana.models.receipt import Receipt


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

        return Receipt(
            receipt_id="receipt-001",
            business_transaction_id="tx-001",
            trust_record_hash="hash",
            receipt_hash="receipt-hash",
            signature="c2ln",
            algorithm="ed25519",
            issued_at=datetime.now(UTC),
        )


def test_generate():
    transport = FakeTransport()

    api = ReceiptApi(transport)

    receipt = api.generate("tx-001")

    assert transport.called
    assert transport.method == "POST"
    assert transport.path == "/receipt"
    assert transport.body == {"businessTransactionId": "tx-001"}
    assert transport.response_model is Receipt

    assert isinstance(receipt, Receipt)


def test_get_latest():
    transport = FakeTransport()

    api = ReceiptApi(transport)

    receipt = api.get_latest("tx-001")

    assert transport.called
    assert transport.method == "GET"
    assert transport.path == "/receipt/latest/tx-001"
    assert transport.response_model is Receipt

    assert isinstance(receipt, Receipt)
