"""
Parmana Refusal Record API (RFC-0021).
"""

from __future__ import annotations

from typing import cast
from urllib.parse import quote

from parmana.config.transport import Transport
from parmana.models.refusal_record import RefusalRecord
from parmana.serialization import encode


class RefusalApi:
    """
    Refusal Record API (RFC-0021).

    Responsibilities
    ----------------
    - Verify a Refusal Record's signature
    - Retrieve a Refusal Record by Business Transaction ID

    This API does NOT:
    - execute Business Transactions
    - verify Execution Trust Records
    - replay executions
    """

    def __init__(
        self,
        transport: Transport,
    ) -> None:
        self._transport = transport

    def verify(
        self,
        record: RefusalRecord,
    ) -> bool:
        """
        Verify a Refusal Record's signature.

        Maps to POST /refusal/verify -- takes the record itself, not a
        lookup by id. No caller authentication is required by this
        route: it is the capability that makes a refusal independently
        third-party verifiable (RFC-0021).

        Parameters
        ----------
        record:
            The Refusal Record to verify.

        Returns
        -------
        True if the signature is valid, False otherwise.
        """

        payload = cast(
            "dict[str, bool]",
            self._transport.send(
                method="POST",
                path="/refusal/verify",
                body=encode(record),
            ),
        )

        # Only a boolean True counts. A string "false" is truthy.
        return payload["valid"] is True

    def get(
        self,
        business_transaction_id: str,
    ) -> RefusalRecord:
        """
        Retrieve a Refusal Record by Business Transaction ID.

        Maps to GET /refusal/:businessTransactionId. Unlike verify()
        above, this route is behind caller-auth and ownership scoping,
        identically to TrustRecordApi.get().

        Parameters
        ----------
        business_transaction_id:
            Business Transaction identifier.

        Returns
        -------
        Refusal Record.
        """

        return self._transport.send(
            method="GET",
            path=f"/refusal/{quote(business_transaction_id, safe='')}",
            response_model=RefusalRecord,
        )
