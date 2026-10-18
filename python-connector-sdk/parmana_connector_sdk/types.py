"""
Connector authoring contracts: capability definitions, DTOs, and the
Connector protocol.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol, runtime_checkable

from .credentials import CredentialHandle

ConnectorCapability = str
"""
Namespaced verb capability, e.g. "http:get", "crm:read", "payments:refund".

By convention in this SDK, a ConnectorRequest's `action` IS the capability
string -- this is what capability-based policy checks already check
(``connector.capabilities.includes(request.capability)``). Namespacing is
enforced by ``is_namespaced_capability``, not by a distinct type.
"""

_NAMESPACED_CAPABILITY_PATTERN = re.compile(
    r"^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*:[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$"
)


def is_namespaced_capability(value: str) -> bool:
    return bool(_NAMESPACED_CAPABILITY_PATTERN.match(value))


@dataclass(frozen=True)
class ConnectorCapabilities:
    """
    A connector's declared, namespaced capabilities.
    """

    declared: tuple[ConnectorCapability, ...]

    def includes(self, capability: ConnectorCapability) -> bool:
        return capability in self.declared


def connector_capabilities(
    declared: list[str] | tuple[str, ...],
) -> ConnectorCapabilities:
    """
    Validates namespacing eagerly so a malformed capability (e.g. a bare
    action instead of a namespaced verb) fails at connector construction
    time, not at execution time.
    """
    for capability in declared:
        if not is_namespaced_capability(capability):
            raise ValueError(
                "Connector capability must be a namespaced verb "
                f'(e.g. "http:get"): "{capability}".'
            )
    return ConnectorCapabilities(declared=tuple(declared))


@dataclass(frozen=True)
class ConnectorRequest:
    """
    Request handed to a Connector by the executor.

    Derived, field for field, from the Gateway-verified request -- never
    re-derived or re-interpreted. Connectors receive exactly the authorized
    operation, resource, and parameters.
    """

    capability: ConnectorCapability
    business_transaction_id: str
    action: str
    target: str
    parameters: Mapping[str, Any]


@dataclass(frozen=True)
class ConnectorResponse:
    """
    Deterministic result returned by a Connector.

    ``metadata`` is connector-specific evidence. It must never contain
    credential material.
    """

    success: bool
    metadata: Mapping[str, Any] | None = None


@dataclass(frozen=True)
class ConnectorExecutionContext:
    """
    Execution context supplied to a Connector alongside a ConnectorRequest.

    ``credential`` is an opaque, already-resolved CredentialHandle --
    credential resolution has already happened before a Connector sees this
    context. Connectors never resolve credentials themselves.
    """

    credential: CredentialHandle
    timeout_ms: int
    requested_at: datetime


@runtime_checkable
class Connector(Protocol):
    """
    Canonical Connector contract for the Connector SDK.

    Connectors NEVER evaluate policy, authorize execution, interpret AI
    output, perform business decisions, or resolve credentials. They ONLY
    validate requests, execute operations using an already-resolved
    credential, and return a deterministic response.
    """

    connector_id: str
    capabilities: ConnectorCapabilities

    def execute(
        self, request: ConnectorRequest, context: ConnectorExecutionContext
    ) -> ConnectorResponse: ...
