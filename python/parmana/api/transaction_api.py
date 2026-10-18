"""
Parmana Transaction API.

Retrieve Business Transactions.
"""

from __future__ import annotations

from urllib.parse import quote

from parmana.config.transport import Transport
from parmana.models.business_transaction import BusinessTransaction
from parmana.models.trust_record import ExecutionTrustRecord
from parmana.serialization import encode


class TransactionApi:
    """
    Transaction API.

    Responsibilities
    ----------------
    - Create (execute) a Business Transaction via POST /transactions
    - Retrieve Business Transactions
    - List Business Transactions

    This API does NOT:
    - verify trust records
    - replay executions
    - generate receipts
    """

    def __init__(
        self,
        transport: Transport,
    ) -> None:
        self._transport = transport

    def create(
        self,
        transaction: BusinessTransaction,
    ) -> ExecutionTrustRecord:
        """
        Create (execute) a Business Transaction.

        Maps to POST /transactions: a second, independent entry point
        into the identical application.execute() pipeline as
        ExecutionApi.execute() (POST /execute). The only behavioral
        difference is the success status code, 201 instead of 200; the
        response body shape is otherwise identical.

        Parameters
        ----------
        transaction:
            Business Transaction submitted to the Parmana Runtime.

        Returns
        -------
        Execution Trust Record.
        """

        return self._transport.send(
            method="POST",
            path="/transactions",
            body=encode(transaction),
            response_model=ExecutionTrustRecord,
        )

    def get(
        self,
        business_transaction_id: str,
    ) -> BusinessTransaction:
        """
        Retrieve a Business Transaction.

        Parameters
        ----------
        business_transaction_id:
            Business Transaction identifier.

        Returns
        -------
        Business Transaction.
        """

        return self._transport.send(
            method="GET",
            path=f"/transactions/{quote(business_transaction_id, safe='')}",
            response_model=BusinessTransaction,
        )

    def list(
        self,
        *,
        page: int = 1,
        page_size: int = 25,
    ) -> list[BusinessTransaction]:
        """
        List Business Transactions.

        Parameters
        ----------
        page:
            Page number.

        page_size:
            Number of transactions per page.

        Returns
        -------
        List of Business Transactions.
        """

        return self._transport.send(
            method="GET",
            path=f"/transactions?page={page}&pageSize={page_size}",
            response_model=list[BusinessTransaction],
        )

    #: Makes `client.transactions(page=..., page_size=...)` work
    #: directly, alongside the existing `client.transactions.list(...)`
    #: (and `.get(...)`, `.create(...)`), without renaming the
    #: `ParmanaClient.transactions` attribute out from under existing
    #: callers (examples/08_list_transactions.py, examples/11_end_to_end.py).
    __call__ = list
