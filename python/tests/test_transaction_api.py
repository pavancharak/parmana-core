from __future__ import annotations

from datetime import UTC, datetime

from parmana.api.transaction_api import TransactionApi
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

        transaction = BusinessTransaction(
            business_transaction_id="tx-001",
            metadata=BusinessTransactionMetadata(
                business_transaction_id="tx-001",
            ),
            authority=Authority(
                authority_id="authority-001",
                authority_type="SERVICE",
                principal_id="pytest",
                issued_at=datetime.now(UTC),
            ),
            authorization=Authorization(
                authorization_id="authz-001",
                authority_id="authority-001",
                purpose="Unit Test",
                issued_at=datetime.now(UTC),
            ),
            intent=Intent(
                intent_id="intent-001",
                authorization_id="authz-001",
                action="VendorPayment",
                target="vendor/1",
                parameters={},
                created_at=datetime.now(UTC),
            ),
            policy=PolicyReference(
                name="vendor-payment",
                version="1.0.0",
                schema_version="1.0.0",
            ),
            signals={},
            status="RECEIVED",
            created_at=datetime.now(UTC),
        )

        if response_model == list[BusinessTransaction]:
            return [transaction]

        if response_model is ExecutionTrustRecord:
            return ExecutionTrustRecord(
                trust_record_id="tr-001",
                business_transaction_id="tx-001",
                transaction=transaction,
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

        return transaction


def test_create():
    """
    POST /transactions: a second, independent entry point into the
    identical application.execute() pipeline as ExecutionApi.execute()
    (POST /execute). Previously had zero SDK coverage.
    """
    transport = FakeTransport()

    api = TransactionApi(transport)

    now = datetime.now(UTC)
    transaction = BusinessTransaction(
        business_transaction_id="tx-001",
        metadata=BusinessTransactionMetadata(business_transaction_id="tx-001"),
        authority=Authority(
            authority_id="authority-001",
            authority_type="SERVICE",
            principal_id="pytest",
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
            name="vendor-payment", version="1.0.0", schema_version="1.0.0"
        ),
        signals={},
        status="RECEIVED",
        created_at=now,
    )

    record = api.create(transaction)

    assert transport.called
    assert transport.method == "POST"
    assert transport.path == "/transactions"
    assert transport.response_model is ExecutionTrustRecord
    assert transport.body["businessTransactionId"] == "tx-001"

    assert isinstance(record, ExecutionTrustRecord)
    assert record.business_transaction_id == "tx-001"


def test_get():
    transport = FakeTransport()

    api = TransactionApi(transport)

    transaction = api.get("tx-001")

    assert transport.called
    assert transport.method == "GET"
    assert transport.path == "/transactions/tx-001"
    assert transport.response_model is BusinessTransaction

    assert isinstance(transaction, BusinessTransaction)


def test_list():
    transport = FakeTransport()

    api = TransactionApi(transport)

    transactions = api.list(page=2, page_size=10)

    assert transport.called
    assert transport.method == "GET"
    assert transport.path == "/transactions?page=2&pageSize=10"

    assert isinstance(transactions, list)
    assert isinstance(transactions[0], BusinessTransaction)
