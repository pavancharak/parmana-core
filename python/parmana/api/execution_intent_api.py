"""
Parmana Execution Intent API (ADR-0012).
"""

from __future__ import annotations

from typing import cast
from urllib.parse import quote

from parmana.config.transport import Transport
from parmana.models.execution_intent import ExecutionIntent, ExecutionIntentResolution
from parmana.models.execution_intent_results import (
    ExecutionIntentView,
    FinalizeExecutionIntentResult,
    ResolveExecutionIntentResult,
    UnfinalizedExecutionIntents,
)
from parmana.serialization import encode


class ExecutionIntentApi:
    """
    Execution Intent API (ADR-0012).

    An Execution Intent is a signed statement, stored BEFORE an action is
    released to a connector, of exactly what is about to be released. It proves
    what was about to be released. It does NOT prove the action was released,
    or what its result was.

    Responsibilities
    ----------------
    - Verify an intent's hash and signature (no credential needed)
    - Retrieve an intent and its status
    - List intents that never reached a signed Trust Record
    - Rebuild a missing Trust Record for a released action (finalize)
    - Close an intent an operator reconciled by hand (resolve)

    This API does NOT execute Business Transactions or call any connector.
    """

    def __init__(
        self,
        transport: Transport,
    ) -> None:
        self._transport = transport

    def verify(
        self,
        intent: ExecutionIntent,
    ) -> bool:
        """
        Verify an Execution Intent's hash and signature.

        Maps to POST /execution-intents/verify. Takes the intent itself and
        needs no caller authentication, like RefusalApi.verify().

        Returns True if the intent is genuine and unaltered, False otherwise.
        """

        payload = cast(
            "dict[str, bool]",
            self._transport.send(
                method="POST",
                path="/execution-intents/verify",
                body=encode(intent),
            ),
        )

        # Only a boolean True counts. A string "false" is truthy.
        return payload["valid"] is True

    def get(
        self,
        business_transaction_id: str,
    ) -> ExecutionIntentView:
        """
        Retrieve an Execution Intent and its status.

        Maps to GET /execution-intents/:businessTransactionId. Behind caller
        authentication and ownership scoping.
        """

        return self._transport.send(
            method="GET",
            path=f"/execution-intents/{quote(business_transaction_id, safe='')}",
            response_model=ExecutionIntentView,
        )

    def list_unfinalized(
        self,
        limit: int | None = None,
    ) -> UnfinalizedExecutionIntents:
        """
        List intents that never reached a signed Trust Record and were not
        closed by hand, oldest first.

        Maps to GET /execution-intents/unfinalized. Requires a credential
        provisioned as a verified human. `limit` defaults to 50 on the server,
        with a maximum of 200.
        """

        path = "/execution-intents/unfinalized"

        if limit is not None:
            path = f"{path}?limit={int(limit)}"

        return self._transport.send(
            method="GET",
            path=path,
            response_model=UnfinalizedExecutionIntents,
        )

    def finalize(
        self,
        business_transaction_id: str,
    ) -> FinalizeExecutionIntentResult:
        """
        Rebuild the signed Execution Trust Record for a released action whose
        record was never produced.

        Maps to POST /execution-intents/:businessTransactionId/finalize. It
        never calls a connector and is safe to run twice. Requires a
        credential provisioned as a verified human.
        """

        encoded = quote(business_transaction_id, safe="")

        return self._transport.send(
            method="POST",
            path=f"/execution-intents/{encoded}/finalize",
            response_model=FinalizeExecutionIntentResult,
        )

    def resolve(
        self,
        business_transaction_id: str,
        *,
        resolution: ExecutionIntentResolution | str,
        note: str,
    ) -> ResolveExecutionIntentResult:
        """
        Close a PREPARED or ERRORED intent that a verified human reconciled at
        the connector.

        Maps to POST /execution-intents/:businessTransactionId/resolve.

        Parameters
        ----------
        resolution:
            What you found at the connector: NOT_EXECUTED or EXECUTED.
        note:
            Required, at most 2000 characters. What you checked and found.

        The resolution is an attributed operator statement in unsigned status.
        It is not tamper evident and it is not a Trust Record. It never calls
        a connector and is idempotent.
        """

        value = (
            resolution.value
            if isinstance(resolution, ExecutionIntentResolution)
            else resolution
        )

        encoded = quote(business_transaction_id, safe="")

        return self._transport.send(
            method="POST",
            path=f"/execution-intents/{encoded}/resolve",
            body={"resolution": value, "note": note},
            response_model=ResolveExecutionIntentResult,
        )
