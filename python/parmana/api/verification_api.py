"""
Parmana Verification API.

Verify Execution Trust Records.
"""

from __future__ import annotations

from urllib.parse import quote

from parmana.config.transport import Transport
from parmana.models.verification import Verification


class VerificationApi:
    """
    Verification API.

    Responsibilities
    ----------------
    - Verify Execution Trust Records (fresh verification)
    - Retrieve the latest cached Verification

    This API does NOT:
    - execute Business Transactions
    - replay executions
    - generate receipts
    - validate policies
    """

    def __init__(
        self,
        transport: Transport,
    ) -> None:
        self._transport = transport

    def verify(
        self,
        business_transaction_id: str,
    ) -> Verification:
        """
        Run a fresh verification of an Execution Trust Record.

        Maps to POST /verify. Each call re-verifies the record and
        appends a new Verification to its history.

        Parameters
        ----------
        business_transaction_id:
            Business Transaction identifier.

        Returns
        -------
        Verification.
        """

        return self._transport.send(
            method="POST",
            path="/verify",
            body={
                "businessTransactionId": business_transaction_id,
            },
            response_model=Verification,
        )

    def get_latest(
        self,
        business_transaction_id: str,
    ) -> Verification:
        """
        Retrieve the most recent Verification without re-verifying.

        Maps to GET /verification/:id, distinct from `verify()` (POST
        /verify), which performs a fresh verification.

        Parameters
        ----------
        business_transaction_id:
            Business Transaction identifier.

        Returns
        -------
        Verification.
        """

        return self._transport.send(
            method="GET",
            path=f"/verification/{quote(business_transaction_id, safe='')}",
            response_model=Verification,
        )
