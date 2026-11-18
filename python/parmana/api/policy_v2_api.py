"""
Policy version 2 API.

Decide an action under policy version 2, and read or decide the review items
that a decision can open. Nothing here releases an action: a decision records
the outcome and reports released: False.
"""

from __future__ import annotations

from typing import Any, Literal, cast
from urllib.parse import quote

from parmana.config.transport import Transport
from parmana.models.policy_v2 import (
    PolicyV2Decision,
    PolicyV2ReviewDecision,
    PolicyV2ReviewView,
)
from parmana.serialization import decode


class PolicyV2Api:
    """
    Policy version 2 API.
    """

    def __init__(
        self,
        transport: Transport,
    ) -> None:
        self._transport = transport

    def decide(
        self,
        *,
        capability: str,
        transaction_id: str,
        target: str,
        parameters: dict[str, Any] | None = None,
        signals: dict[str, Any] | None = None,
        approvals: dict[str, Any] | None = None,
    ) -> PolicyV2Decision:
        """
        Run and record a decision under policy version 2. The caller must be
        authenticated.

        Maps to POST /v2/decisions.

        Parameters
        ----------
        capability:
            Namespace and verb, for example ``erp:pay-invoice``.
        transaction_id:
            The Business Transaction this decision is for.
        target:
            The system the action is for.
        parameters:
            The action's parameters.
        signals:
            Caller values, by signal name. Untrusted unless a registered source
            signed them.
        approvals:
            Approval artifacts, by approval signal name. The server checks them.
        """

        body: dict[str, Any] = {
            "capability": capability,
            "transactionId": transaction_id,
            "target": target,
            "parameters": parameters if parameters is not None else {},
            "signals": signals if signals is not None else {},
        }
        if approvals is not None:
            body["approvals"] = approvals

        payload = cast(
            "dict[str, Any]",
            self._transport.send(method="POST", path="/v2/decisions", body=body),
        )

        return decode(payload, PolicyV2Decision)

    def review(self, item_id: str) -> PolicyV2ReviewView:
        """
        The status of a review item, for the requester who asked for it.

        Maps to GET /v2/reviews/{item_id}. Any other caller gets 404.
        """

        payload = cast(
            "dict[str, Any]",
            self._transport.send(
                method="GET",
                path=f"/v2/reviews/{quote(item_id, safe='')}",
            ),
        )

        return decode(payload, PolicyV2ReviewView)

    def decide_review(
        self,
        item_id: str,
        decision: Literal["approve", "reject"],
    ) -> PolicyV2ReviewDecision:
        """
        A reviewer approves or rejects a review item. The reviewer must hold an
        active grant for the item's action.

        Maps to POST /v2/reviews/{item_id}/decision.
        """

        payload = cast(
            "dict[str, Any]",
            self._transport.send(
                method="POST",
                path=f"/v2/reviews/{quote(item_id, safe='')}/decision",
                body={"decision": decision},
            ),
        )

        return decode(payload, PolicyV2ReviewDecision)
