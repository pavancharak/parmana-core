from __future__ import annotations

from .api_error import ParmanaError


class ConfigurationError(ParmanaError):
    """
    Raised when SDK configuration is invalid (e.g. a missing Runtime
    endpoint). Mirrors typescript/src/errors/ConfigurationError.ts.
    """

    def __init__(
        self,
        message: str,
        *,
        request_id: str | None = None,
    ) -> None:
        super().__init__(
            message,
            code="CONFIGURATION_ERROR",
            request_id=request_id,
        )
