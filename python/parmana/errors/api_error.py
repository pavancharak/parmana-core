from __future__ import annotations


class ParmanaError(Exception):
    """
    Canonical base exception for all Parmana SDK errors (see
    docs/site/sdks/api-coverage.mdx, parity rules). Every SDK-specific exception
    inherits from this class, mirroring
    typescript/src/errors/ParmanaError.ts.
    """

    def __init__(
        self,
        message: str,
        *,
        code: str = "API_ERROR",
        request_id: str | None = None,
    ) -> None:
        super().__init__(message)

        self.code = code
        self.request_id = request_id


#: Backward-compatible alias -- this class was previously named
#: ApiError. Existing `except ApiError` / `isinstance(e, ApiError)`
#: code keeps working unchanged.
ApiError = ParmanaError
