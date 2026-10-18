"""
Scripted, in-memory Connector for hermetic tests.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from .types import (
    ConnectorCapabilities,
    ConnectorExecutionContext,
    ConnectorRequest,
    ConnectorResponse,
)


@dataclass
class MockConnectorScript:
    """
    ``respond`` returns a scripted response for the given request. When
    ``fail_with`` is set, execution raises it instead of responding.
    """

    respond: (
        Callable[[ConnectorRequest, ConnectorExecutionContext], ConnectorResponse]
        | None
    ) = None
    fail_with: Exception | None = None


@dataclass
class MockConnectorOptions:
    connector_id: str
    capabilities: ConnectorCapabilities
    script: MockConnectorScript | None = None


class MockConnector:
    """
    Supports capability declarations, scripted responses, and failure
    injection. Records every request it receives so tests can assert on
    exactly what a connector was asked to execute.
    """

    def __init__(self, options: MockConnectorOptions) -> None:
        self._options = options
        self.connector_id = options.connector_id
        self.capabilities = options.capabilities
        self._calls: list[ConnectorRequest] = []

    @property
    def invocations(self) -> tuple[ConnectorRequest, ...]:
        return tuple(self._calls)

    def execute(
        self, request: ConnectorRequest, context: ConnectorExecutionContext
    ) -> ConnectorResponse:
        if not self.capabilities.includes(request.capability):
            raise ValueError(
                f'MockConnector "{self.connector_id}" does not declare capability '
                f'"{request.capability}".'
            )

        self._calls.append(request)

        script = self._options.script
        if script is not None and script.fail_with is not None:
            raise script.fail_with
        if script is not None and script.respond is not None:
            return script.respond(request, context)
        return ConnectorResponse(success=True, metadata={})
