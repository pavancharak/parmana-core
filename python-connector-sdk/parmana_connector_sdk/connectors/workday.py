"""
Mock Workday connector.

Deterministic, in-memory connector used until a real enterprise connector
is implemented.
"""

from __future__ import annotations

from ..metadata import ConnectorMetadata, ConnectorVersion, healthy_now
from ..mock_connector import MockConnector, MockConnectorOptions
from ..types import connector_capabilities

WorkdayMetadata = ConnectorMetadata(
    connector_id="workday",
    display_name="Workday",
    version=ConnectorVersion(major=1, minor=0, patch=0),
    health=healthy_now(),
    description="Mock connector for Workday expense report execution.",
)


def create_workday_connector() -> MockConnector:
    return MockConnector(
        MockConnectorOptions(
            connector_id="workday",
            capabilities=connector_capabilities(["workday:submit-expense-report"]),
        )
    )
