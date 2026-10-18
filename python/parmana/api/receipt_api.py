"""
Parmana Receipt API.

Generate cryptographic execution receipts.
"""

from __future__ import annotations

from urllib.parse import quote

from parmana.config.transport import Transport
from parmana.models.receipt import Receipt


class ReceiptApi:
    """
    Receipt API.

    Responsibilities
    ----------------
    - Generate execution receipts
    - Retrieve the latest cached receipt

    This API does NOT:
    - execute Business Transactions
    - replay executions
    - verify trust records
    - validate policies
    """

    def __init__(
        self,
        transport: Transport,
    ) -> None:
        self._transport = transport

    def generate(
        self,
        business_transaction_id: str,
    ) -> Receipt:
        """
        Generate an execution receipt.

        Maps to POST /receipt.

        Parameters
        ----------
        business_transaction_id:
            Business Transaction identifier.

        Returns
        -------
        Receipt.
        """

        return self._transport.send(
            method="POST",
            path="/receipt",
            body={
                "businessTransactionId": business_transaction_id,
            },
            response_model=Receipt,
        )

    #: Makes `client.receipt(business_transaction_id)` work directly,
    #: alongside the existing `client.receipt.generate(...)`, without
    #: renaming the `ParmanaClient.receipt` attribute out from under
    #: existing callers (examples/05_receipt.py, examples/11_end_to_end.py).
    __call__ = generate

    def get_latest(
        self,
        business_transaction_id: str,
    ) -> Receipt:
        """
        Retrieve the most recent Receipt without generating a new one.

        Maps to GET /receipt/latest/:id, distinct from `generate()`
        (POST /receipt), which generates a new Receipt.

        Parameters
        ----------
        business_transaction_id:
            Business Transaction identifier.

        Returns
        -------
        Receipt.
        """

        return self._transport.send(
            method="GET",
            path=f"/receipt/latest/{quote(business_transaction_id, safe='')}",
            response_model=Receipt,
        )
