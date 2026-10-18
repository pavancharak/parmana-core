from __future__ import annotations

from .api_error import ApiError


class NetworkError(ApiError):
    """
    Raised when the SDK cannot communicate
    with the Parmana Runtime.
    """

    def __init__(
        self,
        message: str = "Unable to communicate with the Parmana Runtime.",
        *,
        code: str = "NETWORK_ERROR",
        request_id: str | None = None,
    ) -> None:
        super().__init__(
            message,
            code=code,
            request_id=request_id,
        )


class TimeoutError(NetworkError):  # noqa: A001 -- canonical SDK name, see below
    """
    Raised when a Runtime request times out. Mirrors
    typescript/src/errors/TimeoutError.ts.

    Subclasses NetworkError (unlike the TS hierarchy, where it's a
    sibling) so existing `except NetworkError` call sites built before
    this class existed keep catching timeouts unchanged; `except
    TimeoutError` now also lets a caller distinguish the two.

    Shadows the builtin `TimeoutError` only within this module's/
    package's namespace, exactly as the canonical SDK error model
    (docs/site/sdks/api-coverage.mdx, parity rules) requires this class be named; the
    builtin remains reachable as `builtins.TimeoutError`.
    """

    def __init__(
        self,
        message: str = "Request to the Parmana Runtime timed out.",
        *,
        request_id: str | None = None,
    ) -> None:
        super().__init__(
            message,
            code="TIMEOUT_ERROR",
            request_id=request_id,
        )
