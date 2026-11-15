from __future__ import annotations

from typing import TYPE_CHECKING

from .api_error import ParmanaError

if TYPE_CHECKING:
    from parmana.models.trust_record import ExecutionTrustRecord


class ExecutionPendingError(ParmanaError):
    """
    The execute call released the action and its signed record exists, but
    the transaction's status could not be set to EXECUTED. The status is
    still EXECUTING, so the outcome is pending until an operator reconciles
    it (the server answers 202 for this case).

    The action ran. Do not execute the transaction again: reconcile it with
    a human-credentialed client.
    """

    def __init__(
        self,
        business_transaction_id: str,
        record: ExecutionTrustRecord,
        reconcile_path: str,
    ) -> None:
        super().__init__(
            f"The action for business transaction '{business_transaction_id}' "
            "was released and its trust record was written, but the status is "
            "still EXECUTING: outcome pending until reconciled.",
            code="EXECUTION_STATUS_PENDING",
        )

        self.business_transaction_id = business_transaction_id
        self.record = record
        self.reconcile_path = reconcile_path
