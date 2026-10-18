"""
Parmana External Connector API.

Connect your own system with no Parmana code change: list the
registrations, propose registering a capability to your HTTPS endpoint or
revoking it, and approve or reject a proposal with a signed step up
authorization. Every call needs an API key that belongs to a verified
human.
"""

from __future__ import annotations

import builtins
from typing import Any, cast
from urllib.parse import quote

from parmana.config.transport import Transport
from parmana.models.external_connector import (
    ExternalConnector,
    ExternalConnectorChange,
)
from parmana.serialization import decode


def _change_path(change_id: str, action: str) -> str:
    return f"/external-connectors/changes/{quote(change_id, safe='')}/{action}"


class ExternalConnectorApi:
    """
    External Connector API.
    """

    def __init__(
        self,
        transport: Transport,
    ) -> None:
        self._transport = transport

    def list(self) -> list[ExternalConnector]:
        """
        Every registration, active and revoked.

        Maps to GET /external-connectors.
        """

        payload = cast(
            "dict[str, Any]",
            self._transport.send(method="GET", path="/external-connectors"),
        )

        return decode(payload["connectors"], list[ExternalConnector])

    def propose_register(
        self,
        *,
        capability: str,
        endpoint_url: str,
        policy: str,
        allowed_parameters: builtins.list[str],
        reason: str,
        timeout_ms: int | None = None,
    ) -> ExternalConnectorChange:
        """
        Propose registering a capability to your HTTPS endpoint.

        Maps to POST /external-connectors/changes with action "register".
        `capability` is namespace:action, outside the built in namespaces
        (paytm, hubspot, github, slack, test). `endpoint_url` is https with
        a public host name. `allowed_parameters` may be empty.
        `timeout_ms` is 1000 to 30000; the server defaults it to 10000.
        Nothing changes until a different person approves it.
        """

        body: dict[str, Any] = {
            "action": "register",
            "capability": capability,
            "endpointUrl": endpoint_url,
            "policy": policy,
            "allowedParameters": allowed_parameters,
            "reason": reason,
        }
        if timeout_ms is not None:
            body["timeoutMs"] = timeout_ms

        return self._propose(body)

    def propose_revoke(
        self,
        *,
        capability: str,
        reason: str,
    ) -> ExternalConnectorChange:
        """
        Propose revoking the active registration for a capability.

        Maps to POST /external-connectors/changes with action "revoke".
        """

        return self._propose(
            {
                "action": "revoke",
                "capability": capability,
                "reason": reason,
            }
        )

    def list_changes(
        self,
        status: str | None = None,
    ) -> builtins.list[ExternalConnectorChange]:
        """
        List external connector changes, newest first.

        Maps to GET /external-connectors/changes.

        Parameters
        ----------
        status:
            "PENDING_APPROVAL", "APPROVED" or "REJECTED". Omit for all.
        """

        path = "/external-connectors/changes"
        if status is not None:
            path += f"?status={quote(status, safe='')}"

        payload = cast(
            "dict[str, Any]",
            self._transport.send(method="GET", path=path),
        )

        return decode(payload["changes"], list[ExternalConnectorChange])

    def approve_change(
        self,
        change_id: str,
        step_up_authorization: dict[str, Any],
    ) -> ExternalConnectorChange:
        """
        Approve and apply an external connector change.

        Maps to POST /external-connectors/changes/{id}/approve. The caller
        must not be the proposer and must have a registered step up key.
        Make `step_up_authorization` with
        `parmana.crypto.sign_policy_change_step_up()`, `change_id` as
        `pending_policy_change_id`, and action "approve".
        """

        return self._transport.send(
            method="POST",
            path=_change_path(change_id, "approve"),
            body={"stepUpAuthorization": step_up_authorization},
            response_model=ExternalConnectorChange,
        )

    def reject_change(
        self,
        change_id: str,
        rejection_reason: str,
        step_up_authorization: dict[str, Any],
    ) -> ExternalConnectorChange:
        """
        Reject an external connector change.

        Maps to POST /external-connectors/changes/{id}/reject. Same caller
        rules as `approve_change()`; sign with action "reject".
        """

        return self._transport.send(
            method="POST",
            path=_change_path(change_id, "reject"),
            body={
                "rejectionReason": rejection_reason,
                "stepUpAuthorization": step_up_authorization,
            },
            response_model=ExternalConnectorChange,
        )

    def _propose(self, body: dict[str, Any]) -> ExternalConnectorChange:
        return self._transport.send(
            method="POST",
            path="/external-connectors/changes",
            body=body,
            response_model=ExternalConnectorChange,
        )
