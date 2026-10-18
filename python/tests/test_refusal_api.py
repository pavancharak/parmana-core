from __future__ import annotations

from datetime import UTC, datetime

from parmana.api.refusal_api import RefusalApi
from parmana.models.execution import Decision, DecisionOutcome
from parmana.models.policy import PolicyReference
from parmana.models.refusal_record import RefusalIntentSnapshot, RefusalRecord
from parmana.models.signature import Signature, SignatureAlgorithm


class FakeTransport:
    def __init__(self, response=None):
        self.called = False
        self.method = None
        self.path = None
        self.body = None
        self.response_model = None
        self._response = response

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

        return self._response


def _make_record() -> RefusalRecord:
    return RefusalRecord(
        refusal_record_id="refusal-001",
        business_transaction_id="tx-001",
        decision=Decision(
            decision_id="decision-001",
            intent_id="intent-001",
            policy=PolicyReference(
                name="vendor-payment", version="2.0.0", schema_version="1.0.0"
            ),
            signals={"riskScore": 999},
            outcome=DecisionOutcome.REJECTED,
            reason="Risk exceeds maximum permitted threshold.",
            evaluated_at=datetime.now(UTC),
        ),
        evaluated_intent=RefusalIntentSnapshot(
            target="vendor/V-1",
            parameters={"amount": 4500},
        ),
        refusal_record_hash="hash",
        signature=Signature(
            algorithm=SignatureAlgorithm.ED25519,
            key_id="default",
            value="c2ln",
            signed_at=datetime.now(UTC),
        ),
        created_at=datetime.now(UTC),
    )


def test_verify_sends_post_refusal_verify_with_the_record_as_body():
    transport = FakeTransport(response={"valid": True})
    api = RefusalApi(transport)

    record = _make_record()
    valid = api.verify(record)

    assert transport.called
    assert transport.method == "POST"
    assert transport.path == "/refusal/verify"
    assert transport.body["refusalRecordId"] == "refusal-001"
    assert transport.body["decision"]["outcome"] == "REJECTED"
    assert transport.response_model is None
    assert valid is True


def test_verify_returns_false_not_just_a_truthy_body_for_an_invalid_signature():
    transport = FakeTransport(response={"valid": False})
    api = RefusalApi(transport)

    valid = api.verify(_make_record())

    assert valid is False


def test_get_sends_get_refusal_by_business_transaction_id():
    transport = FakeTransport(response=_make_record())
    api = RefusalApi(transport)

    record = api.get("tx-001")

    assert transport.called
    assert transport.method == "GET"
    assert transport.path == "/refusal/tx-001"
    assert transport.response_model is RefusalRecord
    assert isinstance(record, RefusalRecord)
    assert record.business_transaction_id == "tx-001"
