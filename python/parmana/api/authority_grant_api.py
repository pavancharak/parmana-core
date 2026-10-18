"""
Parmana Authority Grant API.

Per-agent authority (RFC-0023 phase 3): list the grants, propose granting
an agent's key authority for a capability, within limits, until an
expiry, or revoking it, and approve or reject a proposal with a signed
step up authorization. Every call needs an API key that belongs to a
verified human.
"""

from __future__ import annotations

import builtins
from datetime import datetime
from typing import Any, cast
from urllib.parse import quote

from parmana.config.transport import Transport
from parmana.models.authority_grant import (
    AuthorityGrant,
    AuthorityGrantChange,
)
from parmana.serialization import decode


def _change_path(change_id: str, action: str) -> str:
    return f"/authority-grants/changes/{quote(change_id, safe='')}/{action}"


def _iso(value: datetime | str) -> str:
    return value.isoformat() if isinstance(value, datetime) else value


class AuthorityGrantApi:
    """
    Authority Grant API.
    """

    def __init__(
        self,
        transport: Transport,
    ) -> None:
        self._transport = transport

    def list(self) -> list[AuthorityGrant]:
        """
        Every grant, active and revoked.

        Maps to GET /authority-grants.
        """

        payload = cast(
            "dict[str, Any]",
            self._transport.send(method="GET", path="/authority-grants"),
        )

        return decode(payload["grants"], list[AuthorityGrant])

    def propose_grant(
        self,
        *,
        caller_id: str,
        capability: str,
        valid_until: datetime | str,
        reason: str,
        limits: dict[str, dict[str, Any]] | None = None,
        valid_from: datetime | str | None = None,
    ) -> AuthorityGrantChange:
        """
        Propose granting the API key `caller_id` authority for
        `capability`.

        Maps to POST /authority-grants/changes with action "grant".
        `valid_until` is required, in the future and at most 366 days
        after `valid_from` (which defaults to the approval time); pass a
        timezone aware datetime or an ISO 8601 string. `limits` maps an
        Intent path ("target", "parameters.<name>") to {"min", "max",
        "oneOf"}. You may not propose authority for your own key. Nothing
        changes until a different person approves it.
        """

        body: dict[str, Any] = {
            "action": "grant",
            "callerId": caller_id,
            "capability": capability,
            "validUntil": _iso(valid_until),
            "reason": reason,
        }
        if limits is not None:
            body["limits"] = limits
        if valid_from is not None:
            body["validFrom"] = _iso(valid_from)

        return self._propose(body)

    def propose_revoke(
        self,
        *,
        caller_id: str,
        capability: str,
        reason: str,
    ) -> AuthorityGrantChange:
        """
        Propose revoking the active grant of `caller_id` for `capability`.

        Maps to POST /authority-grants/changes with action "revoke".
        """

        return self._propose(
            {
                "action": "revoke",
                "callerId": caller_id,
                "capability": capability,
                "reason": reason,
            }
        )

    def list_changes(
        self,
        status: str | None = None,
    ) -> builtins.list[AuthorityGrantChange]:
        """
        List authority grant changes, newest first.

        Maps to GET /authority-grants/changes.

        Parameters
        ----------
        status:
            "PENDING_APPROVAL", "APPROVED" or "REJECTED". Omit for all.
        """

        path = "/authority-grants/changes"
        if status is not None:
            path += f"?status={quote(status, safe='')}"

        payload = cast(
            "dict[str, Any]",
            self._transport.send(method="GET", path=path),
        )

        return decode(payload["changes"], list[AuthorityGrantChange])

    def approve_change(
        self,
        change_id: str,
        step_up_authorization: dict[str, Any],
    ) -> AuthorityGrantChange:
        """
        Approve and apply an authority grant change.

        Maps to POST /authority-grants/changes/{id}/approve. The caller
        must be neither the proposer nor the grantee, and must have a
        registered step up key. Make `step_up_authorization` with
        `parmana.crypto.sign_policy_change_step_up()`, `change_id` as
        `pending_policy_change_id`, and action "approve".
        """

        return self._transport.send(
            method="POST",
            path=_change_path(change_id, "approve"),
            body={"stepUpAuthorization": step_up_authorization},
            response_model=AuthorityGrantChange,
        )

    def reject_change(
        self,
        change_id: str,
        rejection_reason: str,
        step_up_authorization: dict[str, Any],
    ) -> AuthorityGrantChange:
        """
        Reject an authority grant change.

        Maps to POST /authority-grants/changes/{id}/reject. Same caller
        rules as `approve_change()`; sign with action "reject".
        """

        return self._transport.send(
            method="POST",
            path=_change_path(change_id, "reject"),
            body={
                "rejectionReason": rejection_reason,
                "stepUpAuthorization": step_up_authorization,
            },
            response_model=AuthorityGrantChange,
        )

    def _propose(self, body: dict[str, Any]) -> AuthorityGrantChange:
        return self._transport.send(
            method="POST",
            path="/authority-grants/changes",
            body=body,
            response_model=AuthorityGrantChange,
        )
