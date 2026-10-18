from __future__ import annotations

from datetime import datetime, timezone

from parmana import AuthorityGrant, AuthorityGrantChange, ParmanaClient
from parmana.api.authority_grant_api import AuthorityGrantApi
from parmana.models.policy_change import PendingPolicyChangeStatus

# Real captured responses (openapi/openapi.yaml examples).
REVOKED = {
    "grants": [
        {
            "grantId": "9f3cf733-a8ed-487c-bb58-a53950388cdf",
            "callerId": "warehouse-agent",
            "capability": "erp:release-goods",
            "limits": {
                "parameters.amount": {"max": 100000},
                "parameters.currency": {"oneOf": ["INR"]},
            },
            "validFrom": "2026-10-11T03:29:05.247Z",
            "validUntil": "2026-12-30T00:00:00.000Z",
            "status": "revoked",
            "grantedAt": "2026-10-11T03:29:05.247Z",
            "revokedByChangeId": "77a3b517-4ae0-4c72-8f0c-5aa6ed913df1",
            "revokedAt": "2026-10-11T03:29:05.300Z",
        }
    ]
}

APPROVED_GRANT = {
    "changeId": "9f3cf733-a8ed-487c-bb58-a53950388cdf",
    "action": "grant",
    "callerId": "warehouse-agent",
    "capability": "erp:release-goods",
    "limits": {
        "parameters.amount": {"max": 100000},
        "parameters.currency": {"oneOf": ["INR"]},
    },
    "validUntil": "2026-12-30T00:00:00.000Z",
    "reason": (
        "The warehouse agent releases goods for paid invoices up to 100000 INR "
        "this quarter."
    ),
    "proposedBy": "grant-maker",
    "proposedAt": "2026-10-11T03:29:05.220Z",
    "status": "APPROVED",
    "resolvedBy": "grant-checker",
    "resolvedAt": "2026-10-11T03:29:05.247Z",
}

REJECTED_REVOKE = {
    "changeId": "c7955228-f718-4f21-8ac9-c48ce907b91a",
    "action": "revoke",
    "callerId": "warehouse-agent",
    "capability": "erp:release-goods",
    "reason": "The warehouse agent's key is being rotated.",
    "proposedBy": "grant-maker",
    "proposedAt": "2026-10-11T03:29:05.283Z",
    "status": "REJECTED",
    "resolvedBy": "grant-checker",
    "resolvedAt": "2026-10-11T03:29:05.285Z",
    "rejectionReason": "Keep the grant until the new key is live.",
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


def test_list_decodes_a_grant_with_its_limits_and_expiry():
    transport = FakeTransport(REVOKED)

    grants = AuthorityGrantApi(transport).list()

    assert transport.calls[0][:2] == ("GET", "/authority-grants")
    grant = grants[0]
    assert isinstance(grant, AuthorityGrant)
    assert grant.caller_id == "warehouse-agent"
    assert grant.capability == "erp:release-goods"
    assert grant.limits == {
        "parameters.amount": {"max": 100000},
        "parameters.currency": {"oneOf": ["INR"]},
    }
    assert isinstance(grant.valid_from, datetime)
    assert isinstance(grant.valid_until, datetime)
    assert grant.status == "revoked"
    assert isinstance(grant.revoked_at, datetime)


def test_propose_grant_sends_the_grant_with_dates_as_iso():
    transport = FakeTransport(APPROVED_GRANT)

    AuthorityGrantApi(transport).propose_grant(
        caller_id="warehouse-agent",
        capability="erp:release-goods",
        valid_from=datetime(2026, 11, 1, tzinfo=timezone.utc),
        valid_until="2026-12-30T00:00:00.000Z",
        limits={"parameters.amount": {"max": 100000}},
        reason="Why.",
    )

    method, path, body, model = transport.calls[0]
    assert (method, path, model) == (
        "POST",
        "/authority-grants/changes",
        AuthorityGrantChange,
    )
    assert body == {
        "action": "grant",
        "callerId": "warehouse-agent",
        "capability": "erp:release-goods",
        "validUntil": "2026-12-30T00:00:00.000Z",
        "reason": "Why.",
        "limits": {"parameters.amount": {"max": 100000}},
        "validFrom": "2026-11-01T00:00:00+00:00",
    }


def test_propose_grant_leaves_optional_fields_out_when_omitted():
    transport = FakeTransport(APPROVED_GRANT)

    AuthorityGrantApi(transport).propose_grant(
        caller_id="warehouse-agent",
        capability="erp:release-goods",
        valid_until="2026-12-30T00:00:00.000Z",
        reason="Why.",
    )

    assert set(transport.calls[0][2]) == {
        "action",
        "callerId",
        "capability",
        "validUntil",
        "reason",
    }


def test_propose_revoke_sends_only_the_caller_capability_and_reason():
    transport = FakeTransport(REJECTED_REVOKE)

    AuthorityGrantApi(transport).propose_revoke(
        caller_id="warehouse-agent", capability="erp:release-goods", reason="Why."
    )

    assert transport.calls[0][2] == {
        "action": "revoke",
        "callerId": "warehouse-agent",
        "capability": "erp:release-goods",
        "reason": "Why.",
    }


def test_list_changes_filters_by_status_and_decodes():
    transport = FakeTransport({"changes": [REJECTED_REVOKE, APPROVED_GRANT]})
    api = AuthorityGrantApi(transport)

    changes = api.list_changes("PENDING_APPROVAL")
    api.list_changes()

    assert transport.calls[0][1] == "/authority-grants/changes?status=PENDING_APPROVAL"
    assert transport.calls[1][1] == "/authority-grants/changes"
    assert changes[0].status == PendingPolicyChangeStatus.REJECTED
    assert changes[1].status == PendingPolicyChangeStatus.APPROVED
    assert isinstance(changes[1].valid_until, datetime)


def test_approve_and_reject_put_the_step_up_on_the_change_path():
    transport = FakeTransport(APPROVED_GRANT)
    api = AuthorityGrantApi(transport)

    api.approve_change("c/1", STEP_UP)
    api.reject_change("c-2", "No.", STEP_UP)

    assert transport.calls[0][:3] == (
        "POST",
        "/authority-grants/changes/c%2F1/approve",
        {"stepUpAuthorization": STEP_UP},
    )
    assert transport.calls[1][:3] == (
        "POST",
        "/authority-grants/changes/c-2/reject",
        {"rejectionReason": "No.", "stepUpAuthorization": STEP_UP},
    )


def test_client_exposes_the_api_and_shortcuts():
    client = ParmanaClient(endpoint="http://127.0.0.1:3000")

    assert isinstance(client.authority_grants, AuthorityGrantApi)
    for name in (
        "list_authority_grants",
        "authority_grant_changes",
        "approve_authority_grant_change",
        "reject_authority_grant_change",
    ):
        assert callable(getattr(client, name))
