from __future__ import annotations

from .api_error import ParmanaError


class ReplayError(ParmanaError):
    """
    Raised when deterministic replay fails. Mirrors
    typescript/src/errors/ReplayError.ts.
    """

    def __init__(
        self,
        message: str,
        *,
        request_id: str | None = None,
    ) -> None:
        super().__init__(
            message,
            code="REPLAY_ERROR",
            request_id=request_id,
        )
