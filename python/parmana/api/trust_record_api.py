"""
Parmana Trust Record API.

Retrieve Execution Trust Records.
"""

from __future__ import annotations

from urllib.parse import quote, urlencode

from parmana.config.transport import Transport
from parmana.models.trust_record import ExecutionTrustRecord


class TrustRecordApi:
    """
    Trust Record API.

    Responsibilities
    ----------------
    - Retrieve Execution Trust Records
    - List Execution Trust Records

    This API does NOT:
    - execute Business Transactions
    - verify trust records
    - replay executions
    - generate receipts
    """

    def __init__(
        self,
        transport: Transport,
    ) -> None:
        self._transport = transport

    def get(
        self,
        business_transaction_id: str,
    ) -> ExecutionTrustRecord:
        """
        Retrieve an Execution Trust Record.

        Parameters
        ----------
        business_transaction_id:
            Business Transaction identifier.

        Returns
        -------
        Execution Trust Record.
        """

        return self._transport.send(
            method="GET",
            path=f"/trust-records/{quote(business_transaction_id, safe='')}",
            response_model=ExecutionTrustRecord,
        )

    def list(
        self,
        *,
        page: int = 1,
        page_size: int = 25,
        since: str | None = None,
        until: str | None = None,
    ) -> list[ExecutionTrustRecord]:
        """
        List Execution Trust Records, newest first.

        Maps to GET /trust-records. Only records of Business Transactions
        this caller submitted are returned, so a page may hold fewer than
        `page_size` records.

        Parameters
        ----------
        page:
            Page number.

        page_size:
            Number of Business Transactions per page.

        since:
            Only records of transactions created at or after this ISO 8601
            time.

        until:
            Only records of transactions created at or before this ISO 8601
            time.
        """

        query: dict[str, str] = {"page": str(page), "pageSize": str(page_size)}
        if since is not None:
            query["since"] = since
        if until is not None:
            query["until"] = until

        return self._transport.send(
            method="GET",
            path=f"/trust-records?{urlencode(query)}",
            response_model=list[ExecutionTrustRecord],
        )
