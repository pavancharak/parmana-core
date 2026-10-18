from __future__ import annotations

from datetime import datetime

from parmana import ParmanaClient
from parmana.api.external_connector_api import ExternalConnectorApi
from parmana.models.external_connector import (
    ExternalConnector,
    ExternalConnectorChange,
)
from parmana.models.policy_change import PendingPolicyChangeStatus

# Real captured responses (openapi/openapi.yaml examples).
REGISTRATIONS = {
    "connectors": [
        {
            "registrationId": "1aa68ad8-ab5c-4beb-9ff3-7a6b1fc1ff37",
            "capability": "erp:create-invoice",
            "endpointUrl": "https://erp.example.com/parmana/release",
            "policy": "erp-invoice",
            "allowedParameters": ["amount", "currency", "customerId"],
            "timeoutMs": 10000,
            "status": "active",
            "registeredAt": "2026-09-30T17:25:46.385Z",
        },
        {
            "registrationId": "f3774dad-3182-4206-9aaf-49aefe76b557",
            "capability": "erp:create-invoice",
            "endpointUrl": "https://erp.example.com/parmana/release",
            "policy": "erp-invoice",
            "allowedParameters": ["amount", "currency", "customerId"],
            "timeoutMs": 10000,
            "status": "revoked",
            "registeredAt": "2026-09-30T19:03:21.535Z",
            "revokedByChangeId": "d1164799-36e9-4281-878a-93d666befd42",
            "revokedAt": "2026-09-30T19:03:21.554Z",
        },
    ]
}

REJECTED_CHANGE = {
    "changeId": "f25d72fd-c6da-4223-b614-3658af8d02d2",
    "action": "register",
    "capability": "erp:create-invoice",
    "endpointUrl": "https://erp.example.com/parmana/release",
    "policy": "erp-invoice",
    "allowedParameters": ["amount", "currency"],
    "timeoutMs": 10000,
    "reason": "Finance creates invoices in the ERP through Parmana.",
    "proposedBy": "operator-maker",
    "proposedAt": "2026-10-01T10:14:05.276Z",
    "status": "REJECTED",
    "resolvedBy": "operator-checker",
    "resolvedAt": "2026-10-01T10:14:05.285Z",
    "rejectionReason": "Use the finance team's own endpoint.",
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


def test_list_decodes_active_and_revoked_registrations():
    transport = FakeTransport(REGISTRATIONS)

    connectors = ExternalConnectorApi(transport).list()

    assert transport.calls[0][:2] == ("GET", "/external-connectors")
    assert connectors[0] == ExternalConnector(
        registration_id="1aa68ad8-ab5c-4beb-9ff3-7a6b1fc1ff37",
        capability="erp:create-invoice",
        endpoint_url="https://erp.example.com/parmana/release",
        policy="erp-invoice",
        allowed_parameters=["amount", "currency", "customerId"],
        timeout_ms=10000,
        status="active",
        registered_at=connectors[0].registered_at,
    )
    assert isinstance(connectors[0].registered_at, datetime)
    assert connectors[1].status == "revoked"
    assert connectors[1].revoked_by_change_id == "d1164799-36e9-4281-878a-93d666befd42"
    assert isinstance(connectors[1].revoked_at, datetime)


def test_propose_register_sends_the_registration():
    transport = FakeTransport(REJECTED_CHANGE)

    ExternalConnectorApi(transport).propose_register(
        capability="erp:create-invoice",
        endpoint_url="https://erp.example.com/parmana/release",
        policy="erp-invoice",
        allowed_parameters=["amount", "currency"],
        reason="Why.",
        timeout_ms=15000,
    )

    method, path, body, model = transport.calls[0]
    assert (method, path, model) == (
        "POST",
        "/external-connectors/changes",
        ExternalConnectorChange,
    )
    assert body == {
        "action": "register",
        "capability": "erp:create-invoice",
        "endpointUrl": "https://erp.example.com/parmana/release",
        "policy": "erp-invoice",
        "allowedParameters": ["amount", "currency"],
        "reason": "Why.",
        "timeoutMs": 15000,
    }


def test_propose_register_leaves_the_timeout_to_the_server_when_omitted():
    transport = FakeTransport(REJECTED_CHANGE)

    ExternalConnectorApi(transport).propose_register(
        capability="erp:create-invoice",
        endpoint_url="https://erp.example.com/parmana/release",
        policy="erp-invoice",
        allowed_parameters=[],
        reason="Why.",
    )

    assert "timeoutMs" not in transport.calls[0][2]


def test_propose_revoke_sends_only_the_capability_and_reason():
    transport = FakeTransport(REJECTED_CHANGE)

    ExternalConnectorApi(transport).propose_revoke(
        capability="erp:create-invoice", reason="Why."
    )

    assert transport.calls[0][2] == {
        "action": "revoke",
        "capability": "erp:create-invoice",
        "reason": "Why.",
    }


def test_list_changes_filters_by_status_and_decodes():
    transport = FakeTransport({"changes": [REJECTED_CHANGE]})
    api = ExternalConnectorApi(transport)

    changes = api.list_changes("PENDING_APPROVAL")
    api.list_changes()

    assert (
        transport.calls[0][1] == "/external-connectors/changes?status=PENDING_APPROVAL"
    )
    assert transport.calls[1][1] == "/external-connectors/changes"
    assert changes[0].change_id == "f25d72fd-c6da-4223-b614-3658af8d02d2"
    assert changes[0].status == PendingPolicyChangeStatus.REJECTED
    assert changes[0].allowed_parameters == ["amount", "currency"]
    assert changes[0].rejection_reason == "Use the finance team's own endpoint."


def test_approve_and_reject_put_the_step_up_on_the_change_path():
    transport = FakeTransport(REJECTED_CHANGE)
    api = ExternalConnectorApi(transport)

    api.approve_change("c/1", STEP_UP)
    api.reject_change("c-2", "No.", STEP_UP)

    assert transport.calls[0][:3] == (
        "POST",
        "/external-connectors/changes/c%2F1/approve",
        {"stepUpAuthorization": STEP_UP},
    )
    assert transport.calls[1][:3] == (
        "POST",
        "/external-connectors/changes/c-2/reject",
        {"rejectionReason": "No.", "stepUpAuthorization": STEP_UP},
    )


def test_client_exposes_the_api_and_shortcuts():
    client = ParmanaClient(endpoint="http://127.0.0.1:3000")

    assert isinstance(client.external_connectors, ExternalConnectorApi)
    for name in (
        "list_external_connectors",
        "external_connector_changes",
        "approve_external_connector_change",
        "reject_external_connector_change",
    ):
        assert callable(getattr(client, name))
