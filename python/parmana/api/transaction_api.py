"""
Parmana Transaction API.

Retrieve Business Transactions.
"""

from __future__ import annotations

from urllib.parse import quote

from parmana.config.transport import Transport
from parmana.models.business_transaction import BusinessTransaction
from parmana.models.transaction_status import (
    DeclaredTransaction,
    ReconcileResult,
    TransactionStatusResult,
)
from parmana.models.trust_record import ExecutionTrustRecord
from parmana.serialization import encode


class TransactionApi:
    """
    Transaction API.

    Responsibilities
    ----------------
    - Declare a Business Transaction (POST /transactions), then execute it
      (POST /transactions/{id}/execute), as two calls (decision D23)
    - Read its status, and reconcile one whose outcome is pending
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

    def declare(
        self,
        transaction: BusinessTransaction,
    ) -> DeclaredTransaction:
        """
        Declare a Business Transaction (POST /transactions).

        The transaction is accepted and recorded as RECEIVED. Nothing is
        decided, signed or released; call execute() to release it.

        Parameters
        ----------
        transaction:
            Business Transaction to declare.

        Returns
        -------
        The declared transaction, with status RECEIVED.
        """

        return self._transport.send(
            method="POST",
            path="/transactions",
            body=encode(transaction),
            response_model=DeclaredTransaction,
        )

    def execute(
        self,
        business_transaction_id: str,
    ) -> ExecutionTrustRecord:
        """
        Execute a declared Business Transaction (POST
        /transactions/{id}/execute).

        Parameters
        ----------
        business_transaction_id:
            Identifier of a transaction declared with declare().

        Returns
        -------
        Execution Trust Record.
        """

        return self._transport.send(
            method="POST",
            path=f"/transactions/{quote(business_transaction_id, safe='')}/execute",
            response_model=ExecutionTrustRecord,
        )

    def create(
        self,
        transaction: BusinessTransaction,
    ) -> ExecutionTrustRecord:
        """
        Declare and then execute a Business Transaction, in two calls.

        Before decision D23 the API offered this as one call. It is kept
        so existing callers keep working.

        Parameters
        ----------
        transaction:
            Business Transaction submitted to the Parmana Runtime.

        Returns
        -------
        Execution Trust Record.
        """

        declared = self.declare(transaction)

        return self.execute(declared.business_transaction_id)

    def status(
        self,
        business_transaction_id: str,
        *,
        history: bool = False,
    ) -> TransactionStatusResult:
        """
        Read the status of a Business Transaction (GET
        /transactions/{id}/status).

        Parameters
        ----------
        business_transaction_id:
            Business Transaction identifier.

        history:
            Include every status event, oldest first.

        Returns
        -------
        The current status, and the history when requested.
        """

        query = "?history=true" if history else ""

        return self._transport.send(
            method="GET",
            path=f"/transactions/{quote(business_transaction_id, safe='')}/status{query}",
            response_model=TransactionStatusResult,
        )

    def reconcile(
        self,
        business_transaction_id: str,
    ) -> ReconcileResult:
        """
        Reconcile a Business Transaction whose outcome is pending (POST
        /transactions/{id}/reconcile). Operator credentials only.

        Parameters
        ----------
        business_transaction_id:
            Business Transaction identifier.

        Returns
        -------
        Whether the status changed, and the status now.
        """

        return self._transport.send(
            method="POST",
            path=f"/transactions/{quote(business_transaction_id, safe='')}/reconcile",
            response_model=ReconcileResult,
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
