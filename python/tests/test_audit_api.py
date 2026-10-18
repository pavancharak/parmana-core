from __future__ import annotations

from datetime import UTC, datetime

from parmana.api.audit_api import AuditApi
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


def _make_signature() -> Signature:
    return Signature(
        algorithm=SignatureAlgorithm.ED25519,
        key_id="default",
        value="c2ln",
        signed_at=datetime.now(UTC),
    )


def test_verify_sends_post_audit_verify_with_event_and_signature():
    transport = FakeTransport(response={"valid": True})
    api = AuditApi(transport)

    event = {
        "type": "caller.authenticated",
        "occurredAt": "2026-01-01T00:00:00.000Z",
        "route": "/execute",
        "callerId": "caller-1",
    }

    valid = api.verify(event, _make_signature())

    assert transport.called
    assert transport.method == "POST"
    assert transport.path == "/audit/verify"
    assert transport.body["event"] == event
    assert transport.body["signature"]["keyId"] == "default"
    assert transport.body["signature"]["algorithm"] == "ed25519"
    assert transport.response_model is None
    assert valid is True


def test_verify_returns_false_not_just_a_truthy_body_for_an_invalid_signature():
    transport = FakeTransport(response={"valid": False})
    api = AuditApi(transport)

    valid = api.verify(
        {"type": "x", "occurredAt": "2026-01-01T00:00:00.000Z", "route": "/r"},
        _make_signature(),
    )

    assert valid is False
