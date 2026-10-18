from __future__ import annotations

from parmana import ParmanaClient
from parmana.api.approver_api import ApproverApi
from parmana.models.approval_issuer import ApprovalIssuer, ApprovalIssuerChange
from parmana.models.policy_change import PendingPolicyChangeStatus

CHANGE = {
    "changeId": "ba7c5827-5844-4069-94fc-9b438ef08f78",
    "action": "add",
    "approverId": "manager-priya",
    "keyId": "manager-priya-key-1",
    "publicKeyPem": "-----BEGIN PUBLIC KEY-----\nMCow\n-----END PUBLIC KEY-----\n",
    "reason": "Priya approves refunds for the West region from October.",
    "proposedBy": "human-maker",
    "proposedAt": "2026-09-28T19:05:59.726Z",
    "status": "PENDING_APPROVAL",
}


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


def test_list_decodes_code_and_governed_keys():
    transport = FakeTransport(
        {
            "issuers": [
                {
                    "approverId": "manager-charak1987",
                    "keyId": "manager-charak1987-key-1",
                    "revoked": False,
                    "source": "code",
                    "publicKeyPem": "PEM",
                },
                {
                    "approverId": "manager-priya",
                    "keyId": "manager-priya-key-1",
                    "publicKeyPem": "PEM",
                    "revoked": True,
                    "addedByChangeId": "c-1",
                    "addedAt": "2026-09-28T19:05:59.738Z",
                    "revokedByChangeId": "c-2",
                    "revokedAt": "2026-09-29T10:00:00.000Z",
                    "source": "governed",
                },
            ]
        }
    )

    issuers = ApproverApi(transport).list()

    assert transport.calls[0][:2] == ("GET", "/approval-issuers")
    assert all(isinstance(issuer, ApprovalIssuer) for issuer in issuers)
    assert issuers[0].source == "code"
    assert issuers[0].added_by_change_id is None
    assert issuers[1].revoked is True
    assert issuers[1].revoked_by_change_id == "c-2"


def test_propose_add_and_revoke_send_the_documented_bodies():
    transport = FakeTransport(CHANGE)
    api = ApproverApi(transport)

    api.propose_add(
        approver_id="manager-priya",
        key_id="manager-priya-key-1",
        public_key_pem="PEM",
        reason="Why.",
    )
    api.propose_revoke(
        approver_id="manager-priya", key_id="manager-priya-key-1", reason="Why."
    )

    assert transport.calls[0][:3] == (
        "POST",
        "/approval-issuers/changes",
        {
            "action": "add",
            "approverId": "manager-priya",
            "keyId": "manager-priya-key-1",
            "publicKeyPem": "PEM",
            "reason": "Why.",
        },
    )
    assert transport.calls[0][3] is ApprovalIssuerChange
    assert transport.calls[1][2] == {
        "action": "revoke",
        "approverId": "manager-priya",
        "keyId": "manager-priya-key-1",
        "reason": "Why.",
    }


def test_list_changes_filters_by_status_and_decodes():
    transport = FakeTransport({"changes": [CHANGE]})

    changes = ApproverApi(transport).list_changes("PENDING_APPROVAL")

    assert transport.calls[0][:2] == (
        "GET",
        "/approval-issuers/changes?status=PENDING_APPROVAL",
    )
    assert changes[0].change_id == CHANGE["changeId"]
    assert changes[0].status == PendingPolicyChangeStatus.PENDING_APPROVAL


def test_approve_and_reject_send_the_step_up_to_the_change_path():
    transport = FakeTransport(CHANGE)
    api = ApproverApi(transport)
    step_up = {"payload": {}, "signature": "s", "keyId": "k", "algorithm": "ed25519"}

    api.approve_change("c/1", step_up)
    api.reject_change("c-2", "No.", step_up)

    assert transport.calls[0][:3] == (
        "POST",
        "/approval-issuers/changes/c%2F1/approve",
        {"stepUpAuthorization": step_up},
    )
    assert transport.calls[1][:3] == (
        "POST",
        "/approval-issuers/changes/c-2/reject",
        {"rejectionReason": "No.", "stepUpAuthorization": step_up},
    )


def test_client_exposes_the_approver_api():
    client = ParmanaClient(endpoint="http://127.0.0.1:3000")

    assert isinstance(client.approvers, ApproverApi)
    assert callable(client.list_approvers)
    assert callable(client.approver_changes)
    assert callable(client.approve_approver_change)
    assert callable(client.reject_approver_change)
