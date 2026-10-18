"""
Parmana Audit Event API.
"""

from __future__ import annotations

from typing import Any, cast

from parmana.config.transport import Transport
from parmana.models.signature import Signature
from parmana.serialization import encode


class AuditApi:
    """
    Audit Event API.

    Responsibilities
    ----------------
    - Verify a signed caller-authentication audit event's signature

    This API does NOT:
    - execute Business Transactions
    - look up an audit event by id -- there is no such lookup route;
      verification takes the event and its stored signature directly.
    """

    def __init__(
        self,
        transport: Transport,
    ) -> None:
        self._transport = transport

    def verify(
        self,
        event: dict[str, Any],
        signature: Signature,
    ) -> bool:
        """
        Verify a signed audit event's signature.

        Maps to POST /audit/verify. Takes the event (a CallerAuditEvent,
        as recorded by the Runtime's audit sinks) and its stored
        signature directly, not a lookup by id.
        No caller authentication is required by this route -- the same
        independent, third-party verifiability as
        RefusalApi.verify().

        Parameters
        ----------
        event:
            The signed audit event, exactly as recorded (`type`,
            `occurredAt`, `route`, plus event-specific fields). Left as
            a generic dict, like the Runtime route itself
            (packages/api/src/routes/audit-verify.ts): the two event
            shapes this can verify diverge on every field past those
            three, and verification operates on canonical bytes over
            whatever object was actually signed, not a fixed schema.

        signature:
            The signature stored alongside the event.

        Returns
        -------
        True if the signature is valid, False otherwise.
        """

        payload = cast(
            "dict[str, bool]",
            self._transport.send(
                method="POST",
                path="/audit/verify",
                body=encode({"event": event, "signature": signature}),
            ),
        )

        # Only a boolean True counts. A string "false" is truthy.
        return payload["valid"] is True
