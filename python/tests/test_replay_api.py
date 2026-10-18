from __future__ import annotations

from parmana.api.replay_api import ReplayApi
from parmana.models.replay_result import ReplayResult


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

        return ReplayResult(
            business_transaction_id="tx-001",
            trust_record_hash="hash",
            verified=True,
        )


def test_replay():

    transport = FakeTransport()

    api = ReplayApi(
        transport,
    )

    result = api.replay(
        "tx-001",
    )

    assert transport.called

    assert transport.method == "POST"

    assert transport.path == "/replay"

    assert transport.body == {
        "businessTransactionId": "tx-001",
    }

    assert transport.response_model is ReplayResult

    assert isinstance(
        result,
        ReplayResult,
    )

    assert result.verified is True
