from __future__ import annotations

from datetime import UTC, datetime

import pytest

from parmana.api.transaction_api import TransactionApi
from parmana.errors import ExecutionPendingError
from parmana.models.authority import Authority
from parmana.models.authorization import Authorization
from parmana.models.business_transaction import (
    BusinessTransaction,
    BusinessTransactionMetadata,
)
from parmana.models.intent import Intent
from parmana.models.policy import PolicyReference
from parmana.models.signature import Signature, SignatureAlgorithm
from parmana.models.transaction_status import (
    DeclaredTransaction,
    ReconcileResult,
    TransactionStatusResult,
)
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
        non_throwing_statuses=frozenset(),
    ):
        self.called = True
        self.method = method
        self.path = path
        self.body = body
        self.response_model = response_model

        if non_throwing_statuses:
            # The execute route: a wire payload, decoded by the API.
            return {"trustRecordId": "tr-001"}

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
                name="payment-limit",
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


def _sample_transaction() -> BusinessTransaction:
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
            name="payment-limit", version="1.0.0", schema_version="1.0.0"
        ),
        signals={},
        status="RECEIVED",
        created_at=now,
    )

    return transaction


def test_create(decoded):
    """
    create() declares and then executes: POST /transactions, then POST
    /transactions/{id}/execute (decision D23). The last request is the
    execute call.
    """
    transport = FakeTransport()

    api = TransactionApi(transport)

    transaction = _sample_transaction()

    record = api.create(transaction)

    assert transport.called
    assert transport.method == "POST"
    assert transport.path == "/transactions/tx-001/execute"

    assert record == ("decoded", ExecutionTrustRecord, {"trustRecordId": "tr-001"})


def test_declare_posts_the_transaction_and_returns_the_declared_record():
    transport = FakeTransport()

    api = TransactionApi(transport)

    transaction = _sample_transaction()
    api.declare(transaction)

    assert transport.method == "POST"
    assert transport.path == "/transactions"
    assert transport.body["businessTransactionId"] == "tx-001"
    assert transport.response_model is DeclaredTransaction


class ExecuteTransport:
    """Returns a fixed wire payload from send(), and records the request."""

    def __init__(self, payload):
        self.payload = payload
        self.method = None
        self.path = None
        self.body = None
        self.non_throwing_statuses = None

    def send(
        self,
        *,
        method,
        path,
        body=None,
        response_model=None,
        non_throwing_statuses=frozenset(),
    ):
        self.method = method
        self.path = path
        self.body = body
        self.non_throwing_statuses = non_throwing_statuses
        return self.payload


@pytest.fixture
def decoded(monkeypatch):
    """Replaces the wire decoder: the trust record's wire format is tested elsewhere."""
    import parmana.api.transaction_api as module

    monkeypatch.setattr(
        module, "decode", lambda payload, model: ("decoded", model, payload)
    )


def test_execute_posts_to_the_execute_route_without_a_body(decoded):
    transport = ExecuteTransport({"trustRecordId": "tr-001"})

    api = TransactionApi(transport)
    result = api.execute("tx-001")

    assert transport.method == "POST"
    assert transport.path == "/transactions/tx-001/execute"
    assert transport.body is None
    assert transport.non_throwing_statuses == frozenset({202})
    assert result == ("decoded", ExecutionTrustRecord, {"trustRecordId": "tr-001"})


def test_execute_raises_execution_pending_on_the_202_answer(decoded):
    payload = {
        "businessTransactionId": "tx-001",
        "status": "EXECUTING",
        "outcome": "pending",
        "reconcile": "/transactions/tx-001/reconcile",
        "record": {"trustRecordId": "tr-001"},
    }
    api = TransactionApi(ExecuteTransport(payload))

    with pytest.raises(ExecutionPendingError) as raised:
        api.execute("tx-001")

    error = raised.value
    assert error.code == "EXECUTION_STATUS_PENDING"
    assert error.business_transaction_id == "tx-001"
    assert error.reconcile_path == "/transactions/tx-001/reconcile"
    assert error.record == (
        "decoded",
        ExecutionTrustRecord,
        {"trustRecordId": "tr-001"},
    )


def test_status_reads_the_route_and_asks_for_history_when_requested():
    transport = FakeTransport()

    api = TransactionApi(transport)

    api.status("tx-001")
    assert transport.method == "GET"
    assert transport.path == "/transactions/tx-001/status"

    api.status("tx-001", history=True)
    assert transport.path == "/transactions/tx-001/status?history=true"
    assert transport.response_model is TransactionStatusResult


def test_reconcile_posts_to_the_reconcile_route():
    transport = FakeTransport()

    api = TransactionApi(transport)
    api.reconcile("tx-001")

    assert transport.method == "POST"
    assert transport.path == "/transactions/tx-001/reconcile"
    assert transport.response_model is ReconcileResult


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
