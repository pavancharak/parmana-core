from __future__ import annotations

from collections.abc import Callable

from .api_error import ParmanaError


class ParmanaHttpError(ParmanaError):
    """
    Base class for errors raised from a non-2xx Runtime HTTP response.

    Subclasses map to specific status codes so callers can catch a
    specific failure mode instead of pattern-matching on a message string.
    """

    status_code: int = 0

    def __init__(
        self,
        message: str,
        *,
        status_code: int,
        code: str = "HTTP_ERROR",
        request_id: str | None = None,
    ) -> None:
        super().__init__(
            message,
            code=code,
            request_id=request_id,
        )

        self.status_code = status_code


class ValidationError(ParmanaHttpError):
    """
    Raised on HTTP 400.

    The Runtime rejected the request body (for example, an invalid
    businessTransactionId or a missing required field).
    """

    def __init__(
        self,
        message: str,
        *,
        request_id: str | None = None,
    ) -> None:
        super().__init__(
            message,
            status_code=400,
            code="VALIDATION_ERROR",
            request_id=request_id,
        )


class AuthenticationError(ParmanaHttpError):
    """
    Raised on HTTP 401.
    """

    def __init__(
        self,
        message: str,
        *,
        request_id: str | None = None,
    ) -> None:
        super().__init__(
            message,
            status_code=401,
            code="AUTHENTICATION_ERROR",
            request_id=request_id,
        )


class AuthorizationError(ParmanaHttpError):
    """
    Raised on HTTP 403 for a caller that is authenticated but not
    permitted to do the specific thing it asked for. Covers two distinct
    denials, both intentionally collapsed to this one SDK exception since
    both share the same "who you are is known; you can't do this" shape
    -- distinguish them via `server_code`/`message` if needed, not via
    `type()`:

    - a caller asserting an authority.principalId it isn't permitted to
      assert (isPrincipalAllowed, packages/api/src/routes/execute.ts and
      transactions.ts) -- carries no `code` field of its own.
    - a caller invoking a capability (intent.action) it isn't permitted
      to invoke (isCapabilityAllowed.ts) -- carries
      `code: "CAPABILITY_NOT_ALLOWED"`, preserved on `server_code` below.

    Distinct from AuthenticationError (401, no valid credential at all).
    """

    def __init__(
        self,
        message: str,
        *,
        request_id: str | None = None,
        server_code: str | None = None,
    ) -> None:
        super().__init__(
            message,
            status_code=403,
            code="AUTHORIZATION_ERROR",
            request_id=request_id,
        )

        #: The Runtime's own `code` field, when the 403 carried one
        #: (currently only the capability-denied case:
        #: "CAPABILITY_NOT_ALLOWED"). None for the principal-mismatch
        #: case, which the Runtime sends with no `code` at all -- see
        #: build_http_error's CAPABILITY_NOT_ALLOWED check.
        self.server_code = server_code


class ExecutionRejectedError(ParmanaHttpError):
    """
    Raised when Policy evaluation rejects a Business Transaction.

    Reached over HTTP 403, code POLICY_DENIED, with a message starting
    "Execution rejected:" (packages/runtime/src/ExecutionGate.ts,
    packages/api/src/middleware/error-handler.ts; see
    docs/site/api-reference/error-catalog.mdx). Distinct from the two
    *other* 403 shapes this API returns (both AuthorizationError: a
    caller-identity/principal mismatch, no `code` field at all; and a
    capability-scoping denial, `code: "CAPABILITY_NOT_ALLOWED"`) -- see
    build_http_error's POLICY_DENIED check, which runs ahead of the
    generic status-based mapping for exactly this reason.

    Previously reached over HTTP 500, code RUNTIME_ERROR (no dedicated
    status of its own). That gap was fixed at the source; this class and
    build_http_error were updated to match the current shape, not kept
    around to work around the old ambiguity -- mirroring
    typescript/src/transport/mapHttpErrorResponse.ts's own documented
    history of the identical change.
    """

    def __init__(
        self,
        message: str,
        *,
        request_id: str | None = None,
    ) -> None:
        super().__init__(
            message,
            status_code=403,
            code="EXECUTION_REJECTED",
            request_id=request_id,
        )


class NotFoundError(ParmanaHttpError):
    """
    Raised on HTTP 404.
    """

    def __init__(
        self,
        message: str,
        *,
        request_id: str | None = None,
    ) -> None:
        super().__init__(
            message,
            status_code=404,
            code="NOT_FOUND",
            request_id=request_id,
        )


class ConflictError(ParmanaHttpError):
    """
    Raised on HTTP 409.

    For example, a duplicate Business Transaction (see
    DuplicateBusinessTransactionError in packages/runtime).
    """

    def __init__(
        self,
        message: str,
        *,
        request_id: str | None = None,
    ) -> None:
        super().__init__(
            message,
            status_code=409,
            code="CONFLICT",
            request_id=request_id,
        )


class RateLimitError(ParmanaHttpError):
    """
    Raised on HTTP 429: the caller has exceeded the per-identity rate
    limit on POST /execute, or the IP-keyed limit on GET /health,/ready
    (see packages/api's rate-limiting middleware). Distinct from every
    other 4xx this SDK raises -- it is not a request defect, it is a
    transient condition the caller should back off and retry, so
    `retry_after_seconds` (parsed from the response's `Retry-After`
    header, when present) is exposed for callers that want to honor the
    Runtime's own hint rather than guess a delay.
    """

    def __init__(
        self,
        message: str,
        *,
        request_id: str | None = None,
        retry_after_seconds: float | None = None,
    ) -> None:
        super().__init__(
            message,
            status_code=429,
            code="RATE_LIMIT_ERROR",
            request_id=request_id,
        )

        #: Seconds to wait before retrying, taken from the response's
        #: `Retry-After` header. None when the Runtime didn't send one.
        self.retry_after_seconds = retry_after_seconds


class InternalServerError(ParmanaHttpError):
    """
    Raised on any HTTP 5xx response. Named InternalServerError for
    parity with the canonical error hierarchy (docs/site/sdks/api-coverage.mdx,
    typescript/src/errors/InternalServerError.ts); ServerError below
    is a backward-compatible alias of this class.
    """

    def __init__(
        self,
        message: str,
        *,
        status_code: int = 500,
        request_id: str | None = None,
        server_code: str | None = None,
    ) -> None:
        super().__init__(
            message,
            status_code=status_code,
            code="SERVER_ERROR",
            request_id=request_id,
        )

        #: The Runtime's own `code` field, for example
        #: SIGNING_UNAVAILABLE (nothing was executed) or
        #: EXECUTION_RECORD_INCOMPLETE (the action was released). None
        #: when the response carried no code.
        self.server_code = server_code


#: Backward-compatible alias -- this class was previously named
#: ServerError. Existing `except ServerError` / `isinstance(e, ServerError)`
#: code keeps working unchanged.
ServerError = InternalServerError


_STATUS_MAP: dict[int, Callable[..., ParmanaHttpError]] = {
    400: ValidationError,
    401: AuthenticationError,
    403: AuthorizationError,
    404: NotFoundError,
    409: ConflictError,
}


def build_http_error(
    status_code: int,
    message: str,
    *,
    code: str | None = None,
    request_id: str | None = None,
    retry_after_seconds: float | None = None,
) -> ParmanaHttpError:
    """
    Constructs the specific ParmanaHttpError subclass for a response.

    Classification is primarily by HTTP status, with `code` used to
    distinguish the cases that need it. This API returns THREE distinct
    403 shapes, not two -- a fact this docstring previously got wrong:

    - `code: "POLICY_DENIED"` -- a policy REJECTED decision, mapped to
      ExecutionRejectedError, checked first since it needs a wholly
      different SDK exception.
    - `code: "CAPABILITY_NOT_ALLOWED"` -- a caller invoking a capability
      it isn't permitted to invoke (isCapabilityAllowed.ts). Checked
      explicitly (not left to fall through the generic status-map lookup
      below) so its `code` is preserved on AuthorizationError.server_code
      instead of being silently dropped.
    - no `code` at all -- a caller asserting an authority.principalId it
      isn't permitted to assert (isPrincipalAllowed.ts,
      packages/api/src/routes/execute.ts and transactions.ts). Also maps
      to AuthorizationError, via the generic status-map lookup below.

    429 (rate limited) is handled ahead of the generic map too, since it
    needs to thread `retry_after_seconds` through to RateLimitError --
    mirrors typescript/src/transport/mapHttpErrorResponse.ts's identical,
    identically-ordered checks exactly.
    """

    if code == "POLICY_DENIED":
        return ExecutionRejectedError(message, request_id=request_id)

    if code in ("CAPABILITY_NOT_ALLOWED", "TENANT_NOT_ALLOWED"):
        return AuthorizationError(
            message,
            request_id=request_id,
            server_code=code,
        )

    if status_code == 429:
        return RateLimitError(
            message,
            request_id=request_id,
            retry_after_seconds=retry_after_seconds,
        )

    if 500 <= status_code < 600:
        return ServerError(
            message,
            status_code=status_code,
            request_id=request_id,
            server_code=code,
        )

    error_type = _STATUS_MAP.get(status_code)

    if error_type is not None:
        return error_type(message, request_id=request_id)

    return ParmanaHttpError(
        message,
        status_code=status_code,
        request_id=request_id,
    )
