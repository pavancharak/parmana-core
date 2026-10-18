from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, TypeVar, overload

T = TypeVar("T")


class Transport(ABC):
    """
    Base transport abstraction.
    """

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

    @abstractmethod
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
        an ordinary payload instead of raising, because the route's
        response body at that status is not the shared error envelope.
        """
        raise NotImplementedError
