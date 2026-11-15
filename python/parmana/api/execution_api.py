"""
Parmana Execution API.

Execute Business Transactions through the Parmana Runtime.
"""

from __future__ import annotations

from typing import Any, cast

from parmana.config.transport import Transport
from parmana.errors.execution_pending_error import ExecutionPendingError
from parmana.models.business_transaction import BusinessTransaction
from parmana.models.trust_record import ExecutionTrustRecord
from parmana.serialization import decode, encode


class ExecutionApi:
    """
    Execution API.

    Responsibilities
    ----------------
    - Runtime health check
    - Runtime version info
    - Execute Business Transactions

    This API does NOT:
    - verify trust records
    - replay executions
    - generate receipts
    - validate policies
    """

    def __init__(
        self,
        transport: Transport,
    ) -> None:
        self._transport = transport

    def health(
        self,
    ) -> dict[str, Any]:
        """
        Returns the Runtime health status.
        """

        return cast(
            "dict[str, Any]",
            self._transport.send(
                method="GET",
                path="/health",
            ),
        )

    def version(
        self,
    ) -> dict[str, Any]:
        """
        Returns the Runtime name, version, and API version.
        """

        return cast(
            "dict[str, Any]",
            self._transport.send(
                method="GET",
                path="/version",
            ),
        )

    def execute(
        self,
        transaction: BusinessTransaction,
    ) -> ExecutionTrustRecord:
        """
        Execute a Business Transaction.

        Parameters
        ----------
        transaction:
            Business Transaction submitted to the Parmana Runtime.

        Returns
        -------
        Execution Trust Record.
        """

        payload = self._transport.send(
            method="POST",
            path="/execute",
            body=encode(transaction),
            non_throwing_statuses=frozenset({202}),
        )

        # 202: released, but the status is still EXECUTING. Raised, as for
        # TransactionApi.execute. A trust record never carries "outcome".
        if isinstance(payload, dict) and payload.get("outcome") == "pending":
            raise ExecutionPendingError(
                payload["businessTransactionId"],
                decode(payload["record"], ExecutionTrustRecord),
                payload["reconcile"],
            )

        return decode(payload, ExecutionTrustRecord)
