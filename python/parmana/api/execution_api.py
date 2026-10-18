"""
Parmana Execution API.

Execute Business Transactions through the Parmana Runtime.
"""

from __future__ import annotations

from typing import Any, cast

from parmana.config.transport import Transport
from parmana.models.business_transaction import BusinessTransaction
from parmana.models.trust_record import ExecutionTrustRecord
from parmana.serialization import encode


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

        return self._transport.send(
            method="POST",
            path="/execute",
            body=encode(transaction),
            response_model=ExecutionTrustRecord,
        )
