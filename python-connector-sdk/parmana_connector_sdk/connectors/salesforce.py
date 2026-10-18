"""
Mock Salesforce connector.

Deterministic, in-memory connector used until a real enterprise connector
is implemented.
"""

from __future__ import annotations

from ..metadata import ConnectorMetadata, ConnectorVersion, healthy_now
from ..mock_connector import MockConnector, MockConnectorOptions
from ..types import connector_capabilities

SalesforceMetadata = ConnectorMetadata(
    connector_id="salesforce",
    display_name="Salesforce",
    version=ConnectorVersion(major=1, minor=0, patch=0),
    health=healthy_now(),
    description="Mock connector for Salesforce opportunity execution.",
)


def create_salesforce_connector() -> MockConnector:
    return MockConnector(
        MockConnectorOptions(
            connector_id="salesforce",
            capabilities=connector_capabilities(["salesforce:update-opportunity"]),
        )
    )
