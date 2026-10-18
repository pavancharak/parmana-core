from __future__ import annotations

from .api_error import ParmanaError


class VerificationError(ParmanaError):
    """
    Raised when verification fails. Mirrors
    typescript/src/errors/VerificationError.ts.
    """

    def __init__(
        self,
        message: str,
        *,
        request_id: str | None = None,
    ) -> None:
        super().__init__(
            message,
            code="VERIFICATION_ERROR",
            request_id=request_id,
        )
