from __future__ import annotations

from datetime import datetime

from parmana import BusinessSignalSource, BusinessSignalSourceChange, ParmanaClient
from parmana.api.business_signal_source_api import BusinessSignalSourceApi
from parmana.models.policy_change import PendingPolicyChangeStatus

PUBLIC_KEY_PEM = (
    "-----BEGIN PUBLIC KEY-----\n"
    "MCowBQYDK2VwAyEAsgWd/PtRf9OsENif9bgJegghUpmEOOZN5NROxc3zpPc=\n"
    "-----END PUBLIC KEY-----\n"
)

# Real captured responses (openapi/openapi.yaml examples).
REVOKED = {
    "sources": [
        {
            "registrationId": "5ba7d3a6-d56d-4e90-b588-402d44aeee0c",
            "name": "erp",
            "endpointUrl": "https://orders.example.com/parmana/signals",
            "timeoutMs": 5000,
            "publicKeyPem": PUBLIC_KEY_PEM,
            "keyId": "erp-2026-10",
            "status": "revoked",
            "registeredAt": "2026-10-11T02:58:24.745Z",
            "revokedByChangeId": "92ba551c-02bb-4089-9762-6d2d3a89392e",
            "revokedAt": "2026-10-11T02:58:24.800Z",
        }
    ]
}

APPROVED_REGISTER = {
    "changeId": "5ba7d3a6-d56d-4e90-b588-402d44aeee0c",
    "action": "register",
    "name": "erp",
    "endpointUrl": "https://orders.example.com/parmana/signals",
    "timeoutMs": 5000,
    "publicKeyPem": PUBLIC_KEY_PEM,
    "keyId": "erp-2026-10",
    "reason": "Release goods only against invoices the ERP says are paid.",
    "proposedBy": "source-maker",
    "proposedAt": "2026-10-11T02:58:24.725Z",
    "status": "APPROVED",
    "resolvedBy": "source-checker",
    "resolvedAt": "2026-10-11T02:58:24.745Z",
}

REJECTED_REVOKE = {
    "changeId": "48579135-1b91-4ac1-ade4-245e7ca304a3",
    "action": "revoke",
    "name": "erp",
    "reason": "The ERP moves to a new host.",
    "proposedBy": "source-maker",
    "proposedAt": "2026-10-11T02:58:24.789Z",
    "status": "REJECTED",
    "resolvedBy": "source-checker",
    "resolvedAt": "2026-10-11T02:58:24.792Z",
    "rejectionReason": "Keep the current host until the new one is live.",
}

STEP_UP = {"payload": {}, "signature": "s", "keyId": "k", "algorithm": "ed25519"}


class FakeTransport:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def send(
        self,
        *,
        method,
        path,
        body=None,
        response_model=None,
        non_throwing_statuses=frozenset(),
    ):
        self.calls.append((method, path, body, response_model))
        return self.response


def test_list_decodes_a_registration_with_its_key():
    transport = FakeTransport(REVOKED)

    sources = BusinessSignalSourceApi(transport).list()

    assert transport.calls[0][:2] == ("GET", "/business-signal-sources")
    source = sources[0]
    assert isinstance(source, BusinessSignalSource)
    assert source.name == "erp"
    assert source.endpoint_url == "https://orders.example.com/parmana/signals"
    assert source.timeout_ms == 5000
    assert source.public_key_pem is not None
    assert source.public_key_pem.startswith("-----BEGIN PUBLIC KEY-----")
    assert source.key_id == "erp-2026-10"
    assert source.status == "revoked"
    assert isinstance(source.registered_at, datetime)
    assert isinstance(source.revoked_at, datetime)


def test_propose_register_sends_the_registration_and_key():
    transport = FakeTransport(APPROVED_REGISTER)

    BusinessSignalSourceApi(transport).propose_register(
        name="erp",
        endpoint_url="https://orders.example.com/parmana/signals",
        reason="Why.",
        timeout_ms=5000,
        public_key_pem="PEM",
        key_id="erp-2026-10",
    )

    method, path, body, model = transport.calls[0]
    assert (method, path, model) == (
        "POST",
        "/business-signal-sources/changes",
        BusinessSignalSourceChange,
    )
    assert body == {
        "action": "register",
        "name": "erp",
        "endpointUrl": "https://orders.example.com/parmana/signals",
        "reason": "Why.",
        "timeoutMs": 5000,
        "publicKeyPem": "PEM",
        "keyId": "erp-2026-10",
    }


def test_propose_register_leaves_optional_fields_out_when_omitted():
    transport = FakeTransport(APPROVED_REGISTER)

    BusinessSignalSourceApi(transport).propose_register(
        name="erp",
        endpoint_url="https://orders.example.com/parmana/signals",
        reason="Why.",
    )

    assert transport.calls[0][2] == {
        "action": "register",
        "name": "erp",
        "endpointUrl": "https://orders.example.com/parmana/signals",
        "reason": "Why.",
    }


def test_propose_revoke_sends_only_the_name_and_reason():
    transport = FakeTransport(REJECTED_REVOKE)

    BusinessSignalSourceApi(transport).propose_revoke(name="erp", reason="Why.")

    assert transport.calls[0][2] == {
        "action": "revoke",
        "name": "erp",
        "reason": "Why.",
    }


def test_list_changes_filters_by_status_and_decodes():
    transport = FakeTransport({"changes": [REJECTED_REVOKE, APPROVED_REGISTER]})
    api = BusinessSignalSourceApi(transport)

    changes = api.list_changes("PENDING_APPROVAL")
    api.list_changes()

    assert (
        transport.calls[0][1]
        == "/business-signal-sources/changes?status=PENDING_APPROVAL"
    )
    assert transport.calls[1][1] == "/business-signal-sources/changes"
    assert changes[0].status == PendingPolicyChangeStatus.REJECTED
    assert (
        changes[0].rejection_reason
        == "Keep the current host until the new one is live."
    )
    assert changes[1].status == PendingPolicyChangeStatus.APPROVED
    assert changes[1].key_id == "erp-2026-10"


def test_approve_and_reject_put_the_step_up_on_the_change_path():
    transport = FakeTransport(APPROVED_REGISTER)
    api = BusinessSignalSourceApi(transport)

    api.approve_change("c/1", STEP_UP)
    api.reject_change("c-2", "No.", STEP_UP)

    assert transport.calls[0][:3] == (
        "POST",
        "/business-signal-sources/changes/c%2F1/approve",
        {"stepUpAuthorization": STEP_UP},
    )
    assert transport.calls[1][:3] == (
        "POST",
        "/business-signal-sources/changes/c-2/reject",
        {"rejectionReason": "No.", "stepUpAuthorization": STEP_UP},
    )


def test_client_exposes_the_api_and_shortcuts():
    client = ParmanaClient(endpoint="http://127.0.0.1:3000")

    assert isinstance(client.business_signal_sources, BusinessSignalSourceApi)
    for name in (
        "list_business_signal_sources",
        "business_signal_source_changes",
        "approve_business_signal_source_change",
        "reject_business_signal_source_change",
    ):
        assert callable(getattr(client, name))
