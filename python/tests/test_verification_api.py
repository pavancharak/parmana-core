from __future__ import annotations

from datetime import UTC, datetime

from parmana.api.verification_api import VerificationApi
from parmana.models.verification import Verification


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

        return Verification(
            verification_id="verification-001",
            business_transaction_id="tx-001",
            status="VERIFIED",
            message="Execution Trust Record verified successfully.",
            verified_at=datetime.now(UTC),
            trust_record_hash="hash",
        )


def test_verify():

    transport = FakeTransport()

    api = VerificationApi(
        transport,
    )

    verification = api.verify(
        "tx-001",
    )

    assert transport.called

    assert transport.method == "POST"

    assert transport.path == "/verify"

    assert transport.body == {
        "businessTransactionId": "tx-001",
    }

    assert transport.response_model is Verification

    assert isinstance(
        verification,
        Verification,
    )

    assert verification.status == "VERIFIED"


def test_get_latest():

    transport = FakeTransport()

    api = VerificationApi(
        transport,
    )

    verification = api.get_latest(
        "tx-001",
    )

    assert transport.called

    assert transport.method == "GET"

    assert transport.path == "/verification/tx-001"

    assert transport.response_model is Verification

    assert isinstance(
        verification,
        Verification,
    )
