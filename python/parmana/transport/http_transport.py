"""
Parmana HTTP Transport.

Canonical HTTP transport implementation for the Parmana Python SDK.
"""

from __future__ import annotations

import logging
from typing import Any, TypeVar, overload
from urllib.parse import urlsplit

import requests
from requests import Response
from requests.adapters import HTTPAdapter
from requests.exceptions import RequestException, Timeout
from urllib3.util.retry import Retry

from parmana.config.transport import Transport
from parmana.errors.http_error import build_http_error
from parmana.errors.network_error import NetworkError
from parmana.errors.network_error import TimeoutError as ParmanaTimeoutError
from parmana.serialization import decode

logger = logging.getLogger("parmana")

T = TypeVar("T")

REDACTED = "<redacted>"

_LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})


def _check_endpoint_scheme(endpoint: str) -> None:
    """
    Refuse plain HTTP for any host other than this machine.

    The API key travels in the Authorization header, so over plain HTTP it
    would cross the network in clear text. Local development on localhost
    is allowed.
    """

    parts = urlsplit(endpoint)

    if parts.scheme == "https":
        return

    if parts.scheme == "http" and parts.hostname in _LOCAL_HOSTS:
        return

    raise ValueError(
        "Parmana endpoint must use https:// (plain http:// is allowed only "
        f"for localhost): {parts.scheme or 'no scheme'}://{parts.hostname or ''}"
    )


def redact(value: Any) -> Any:
    """
    The structure of a request or response body, with every leaf value
    replaced by REDACTED. Keys and nesting stay, so a debug log shows which
    fields were sent without showing business data (amounts, names, emails,
    account numbers) or anything secret.
    """

    if isinstance(value, dict):
        return {key: redact(item) for key, item in value.items()}

    if isinstance(value, list):
        return [redact(item) for item in value]

    if value is None:
        return None

    return REDACTED


class HttpTransport(Transport):
    """
    Canonical HTTP transport.

    Responsibilities
    ----------------
    - Send HTTP requests over a reused connection pool
    - Retry idempotent (GET) requests with backoff
    - Parse Runtime responses
    - Raise structured SDK exceptions for non-2xx responses
    - Decode Runtime responses into Parmana models
    """

    DEFAULT_TIMEOUT = 30
    DEFAULT_MAX_RETRIES = 3
    DEFAULT_BACKOFF_FACTOR = 0.5

    def __init__(
        self,
        endpoint: str,
        *,
        api_key: str | None = None,
        timeout: int = DEFAULT_TIMEOUT,
        max_retries: int = DEFAULT_MAX_RETRIES,
        backoff_factor: float = DEFAULT_BACKOFF_FACTOR,
        debug: bool = False,
    ) -> None:
        _check_endpoint_scheme(endpoint)

        self._endpoint = endpoint.rstrip("/")
        self._timeout = timeout

        if debug:
            logger.setLevel(logging.DEBUG)

            if not logger.handlers:
                logger.addHandler(logging.StreamHandler())

        #
        # Reused connection pool.
        #
        # GET requests are safe to retry (idempotent); POST is not
        # retried here since the Runtime does not guarantee idempotency
        # for execute/verify/receipt/replay submissions.
        #
        # 429 is in the forcelist too: GET /health,/ready are IP-rate-
        # limited (see packages/api's rate-limiting middleware), and a
        # caller polling them on a fixed interval should be able to just
        # wait out the window rather than handling 429 specially. Still
        # scoped to GET only via allowed_methods below, so POST /execute
        # (also rate-limited) is never auto-retried here -- matches the
        # non-idempotency reasoning above, not the rate-limit exception.
        # urllib3's Retry honors a numeric Retry-After header on 429
        # automatically (respect_retry_after_header defaults to True).
        #
        retry = Retry(
            total=max_retries,
            backoff_factor=backoff_factor,
            status_forcelist=[429, 502, 503, 504],
            allowed_methods=frozenset({"GET"}),
            raise_on_status=False,
        )

        adapter = HTTPAdapter(max_retries=retry)

        self._session = requests.Session()
        self._session.mount("http://", adapter)
        self._session.mount("https://", adapter)

        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        if api_key is not None:
            headers["Authorization"] = f"Bearer {api_key}"

        self._session.headers.update(headers)

    @property
    def endpoint(self) -> str:
        """
        Parmana Runtime endpoint.
        """
        return self._endpoint

    @overload
    def send(
        self,
        *,
        method: str,
        path: str,
        body: Any | None = None,
        response_model: None = None,
        non_throwing_statuses: frozenset[int] = frozenset(),
    ) -> Any: ...

    @overload
    def send(
        self,
        *,
        method: str,
        path: str,
        body: Any | None = None,
        response_model: type[T],
        non_throwing_statuses: frozenset[int] = frozenset(),
    ) -> T: ...

    def send(
        self,
        *,
        method: str,
        path: str,
        body: Any | None = None,
        response_model: type[T] | None = None,
        non_throwing_statuses: frozenset[int] = frozenset(),
    ) -> T | Any:
        """
        Send a request to the Parmana Runtime.

        non_throwing_statuses lists status codes that must be returned as
        an ordinary payload instead of raising, because this specific
        route's response body at that specific status is not the shared
        {error, code?} envelope. Today exactly one route needs this: see
        PolicyApi.validate.
        """

        url = f"{self._endpoint}{path}"

        # Debug logs show the shape of the body, never its values. The
        # Authorization header is never logged at all.
        logger.debug("request method=%s url=%s body=%r", method, url, redact(body))

        try:
            response = self._session.request(
                method=method,
                url=url,
                json=body,
                timeout=self._timeout,
            )

        except Timeout as exc:
            raise ParmanaTimeoutError() from exc

        except RequestException as exc:
            raise NetworkError() from exc

        payload = self._parse_response(
            response,
            non_throwing_statuses=non_throwing_statuses,
        )

        logger.debug(
            "response status=%s payload=%r", response.status_code, redact(payload)
        )

        if response_model is None:
            return payload

        return decode(
            payload,
            response_model,
        )

    def _parse_response(
        self,
        response: Response,
        *,
        non_throwing_statuses: frozenset[int] = frozenset(),
    ) -> Any:
        """
        Parse Runtime response.

        Raises a `ParmanaHttpError` subclass matching the response status
        code for any non-2xx response, except a status listed in
        non_throwing_statuses, which is returned like an ordinary
        payload; never returns any other error body as if it were a
        successful result.
        """

        if response.ok or response.status_code in non_throwing_statuses:

            if not response.content:
                return None

            return response.json()

        try:
            payload = response.json()

            message = payload.get("error") or payload.get("message") or response.reason
            code = payload.get("code")

        except Exception:
            message = response.text or response.reason
            code = None

        raise build_http_error(
            response.status_code,
            message,
            code=code,
            retry_after_seconds=self._retry_after_seconds(response),
        )

    @staticmethod
    def _retry_after_seconds(response: Response) -> float | None:
        """
        Parses the response's `Retry-After` header into seconds, when
        present and numeric. Per RFC 9110 this header can also be an
        HTTP-date; this API only ever sends the integer-seconds form
        (express-rate-limit's default), so an HTTP-date is treated as
        absent rather than guessed at -- mirrors
        typescript/src/transport/mapHttpErrorResponse.ts's identical
        extractRetryAfterSeconds behavior.
        """
        raw = response.headers.get("Retry-After")

        if raw is None:
            return None

        try:
            seconds = float(raw)
        except ValueError:
            return None

        return seconds if seconds >= 0 else None
