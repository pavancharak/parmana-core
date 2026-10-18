"""
Parmana Business Signal Source API.

Connect a business system Parmana asks for the facts a policy needs
(RFC-0023): list the registrations, propose registering a source's HTTPS
endpoint and signing key or revoking it, and approve or reject a proposal
with a signed step up authorization. Every call needs an API key that
belongs to a verified human.
"""

from __future__ import annotations

import builtins
from typing import Any, cast
from urllib.parse import quote

from parmana.config.transport import Transport
from parmana.models.business_signal_source import (
    BusinessSignalSource,
    BusinessSignalSourceChange,
)
from parmana.serialization import decode


def _change_path(change_id: str, action: str) -> str:
    return f"/business-signal-sources/changes/{quote(change_id, safe='')}/{action}"


class BusinessSignalSourceApi:
    """
    Business Signal Source API.
    """

    def __init__(
        self,
        transport: Transport,
    ) -> None:
        self._transport = transport

    def list(self) -> list[BusinessSignalSource]:
        """
        Every registration, active and revoked.

        Maps to GET /business-signal-sources.
        """

        payload = cast(
            "dict[str, Any]",
            self._transport.send(method="GET", path="/business-signal-sources"),
        )

        return decode(payload["sources"], list[BusinessSignalSource])

    def propose_register(
        self,
        *,
        name: str,
        endpoint_url: str,
        reason: str,
        timeout_ms: int | None = None,
        public_key_pem: str | None = None,
        key_id: str | None = None,
    ) -> BusinessSignalSourceChange:
        """
        Propose registering a business system as a signal source.

        Maps to POST /business-signal-sources/changes with action
        "register". `name` is what a policy's signalSources uses in
        `source`: lowercase letters, digits and hyphens. `endpoint_url` is
        https with a public host name. `timeout_ms` is 1000 to 30000; the
        server defaults it to 10000. `public_key_pem` is the Ed25519 key
        the source signs its answers with; recommended, since without it
        Parmana cannot check the source said what it received. `key_id`
        labels the key and needs it. Nothing changes until a different
        person approves it.
        """

        body: dict[str, Any] = {
            "action": "register",
            "name": name,
            "endpointUrl": endpoint_url,
            "reason": reason,
        }
        if timeout_ms is not None:
            body["timeoutMs"] = timeout_ms
        if public_key_pem is not None:
            body["publicKeyPem"] = public_key_pem
        if key_id is not None:
            body["keyId"] = key_id

        return self._propose(body)

    def propose_revoke(
        self,
        *,
        name: str,
        reason: str,
    ) -> BusinessSignalSourceChange:
        """
        Propose revoking the active registration for a name.

        Maps to POST /business-signal-sources/changes with action
        "revoke". Once approved, policies that name the source are refused
        as SOURCE_UNAVAILABLE.
        """

        return self._propose(
            {
                "action": "revoke",
                "name": name,
                "reason": reason,
            }
        )

    def list_changes(
        self,
        status: str | None = None,
    ) -> builtins.list[BusinessSignalSourceChange]:
        """
        List business signal source changes, newest first.

        Maps to GET /business-signal-sources/changes.

        Parameters
        ----------
        status:
            "PENDING_APPROVAL", "APPROVED" or "REJECTED". Omit for all.
        """

        path = "/business-signal-sources/changes"
        if status is not None:
            path += f"?status={quote(status, safe='')}"

        payload = cast(
            "dict[str, Any]",
            self._transport.send(method="GET", path=path),
        )

        return decode(payload["changes"], list[BusinessSignalSourceChange])

    def approve_change(
        self,
        change_id: str,
        step_up_authorization: dict[str, Any],
    ) -> BusinessSignalSourceChange:
        """
        Approve and apply a business signal source change.

        Maps to POST /business-signal-sources/changes/{id}/approve. The
        caller must not be the proposer and must have a registered step up
        key. Make `step_up_authorization` with
        `parmana.crypto.sign_policy_change_step_up()`, `change_id` as
        `pending_policy_change_id`, and action "approve".
        """

        return self._transport.send(
            method="POST",
            path=_change_path(change_id, "approve"),
            body={"stepUpAuthorization": step_up_authorization},
            response_model=BusinessSignalSourceChange,
        )

    def reject_change(
        self,
        change_id: str,
        rejection_reason: str,
        step_up_authorization: dict[str, Any],
    ) -> BusinessSignalSourceChange:
        """
        Reject a business signal source change.

        Maps to POST /business-signal-sources/changes/{id}/reject. Same
        caller rules as `approve_change()`; sign with action "reject".
        """

        return self._transport.send(
            method="POST",
            path=_change_path(change_id, "reject"),
            body={
                "rejectionReason": rejection_reason,
                "stepUpAuthorization": step_up_authorization,
            },
            response_model=BusinessSignalSourceChange,
        )

    def _propose(self, body: dict[str, Any]) -> BusinessSignalSourceChange:
        return self._transport.send(
            method="POST",
            path="/business-signal-sources/changes",
            body=body,
            response_model=BusinessSignalSourceChange,
        )
