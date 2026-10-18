"""
Parmana Approver API.

Approvers managed without a deploy: list the keys trusted to sign
approvals, propose adding or revoking one, and approve or reject a proposal
with a signed step up authorization. Every call needs an API key that
belongs to a verified human.
"""

from __future__ import annotations

import builtins
from typing import Any, cast
from urllib.parse import quote

from parmana.config.transport import Transport
from parmana.models.approval_issuer import ApprovalIssuer, ApprovalIssuerChange
from parmana.serialization import decode


def _change_path(change_id: str, action: str) -> str:
    return f"/approval-issuers/changes/{quote(change_id, safe='')}/{action}"


class ApproverApi:
    """
    Approver API.
    """

    def __init__(
        self,
        transport: Transport,
    ) -> None:
        self._transport = transport

    def list(self) -> list[ApprovalIssuer]:
        """
        Every approver key the server trusts or trusted, revoked ones marked.

        Maps to GET /approval-issuers.
        """

        payload = cast(
            "dict[str, Any]",
            self._transport.send(method="GET", path="/approval-issuers"),
        )

        return decode(payload["issuers"], list[ApprovalIssuer])

    def propose_add(
        self,
        *,
        approver_id: str,
        key_id: str,
        public_key_pem: str,
        reason: str,
    ) -> ApprovalIssuerChange:
        """
        Propose trusting a new approver key.

        Maps to POST /approval-issuers/changes with action "add".
        `public_key_pem` is the .public.pem file
        scripts/generate-approver-key.ts writes. Nothing changes until a
        different person approves it.
        """

        return self._propose(
            {
                "action": "add",
                "approverId": approver_id,
                "keyId": key_id,
                "publicKeyPem": public_key_pem,
                "reason": reason,
            }
        )

    def propose_revoke(
        self,
        *,
        approver_id: str,
        key_id: str,
        reason: str,
    ) -> ApprovalIssuerChange:
        """
        Propose revoking an approver key added through approver changes.

        Maps to POST /approval-issuers/changes with action "revoke". Once
        approved, every approval the key ever signed is refused.
        """

        return self._propose(
            {
                "action": "revoke",
                "approverId": approver_id,
                "keyId": key_id,
                "reason": reason,
            }
        )

    def list_changes(
        self,
        status: str | None = None,
    ) -> builtins.list[ApprovalIssuerChange]:
        """
        List approver changes, newest first.

        Maps to GET /approval-issuers/changes.

        Parameters
        ----------
        status:
            "PENDING_APPROVAL", "APPROVED" or "REJECTED". Omit for all.
        """

        path = "/approval-issuers/changes"
        if status is not None:
            path += f"?status={quote(status, safe='')}"

        payload = cast(
            "dict[str, Any]",
            self._transport.send(method="GET", path=path),
        )

        return decode(payload["changes"], list[ApprovalIssuerChange])

    def approve_change(
        self,
        change_id: str,
        step_up_authorization: dict[str, Any],
    ) -> ApprovalIssuerChange:
        """
        Approve and apply an approver change.

        Maps to POST /approval-issuers/changes/{id}/approve. The caller must
        not be the proposer and must have a registered step up key. Make
        `step_up_authorization` with
        `parmana.crypto.sign_policy_change_step_up()`, `change_id` as
        `pending_policy_change_id`, and action "approve".
        """

        return self._transport.send(
            method="POST",
            path=_change_path(change_id, "approve"),
            body={"stepUpAuthorization": step_up_authorization},
            response_model=ApprovalIssuerChange,
        )

    def reject_change(
        self,
        change_id: str,
        rejection_reason: str,
        step_up_authorization: dict[str, Any],
    ) -> ApprovalIssuerChange:
        """
        Reject an approver change.

        Maps to POST /approval-issuers/changes/{id}/reject. Same caller rules
        as `approve_change()`; sign with action "reject".
        """

        return self._transport.send(
            method="POST",
            path=_change_path(change_id, "reject"),
            body={
                "rejectionReason": rejection_reason,
                "stepUpAuthorization": step_up_authorization,
            },
            response_model=ApprovalIssuerChange,
        )

    def _propose(self, body: dict[str, Any]) -> ApprovalIssuerChange:
        return self._transport.send(
            method="POST",
            path="/approval-issuers/changes",
            body=body,
            response_model=ApprovalIssuerChange,
        )
