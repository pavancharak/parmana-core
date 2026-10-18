"""
Mock Oracle connector.

Deterministic, in-memory connector used until a real enterprise connector
is implemented.
"""

from __future__ import annotations

from ..metadata import ConnectorMetadata, ConnectorVersion, healthy_now
from ..mock_connector import MockConnector, MockConnectorOptions
from ..types import connector_capabilities

OracleMetadata = ConnectorMetadata(
    connector_id="oracle",
    display_name="Oracle",
    version=ConnectorVersion(major=1, minor=0, patch=0),
    health=healthy_now(),
    description="Mock connector for Oracle purchase order execution.",
)


def create_oracle_connector() -> MockConnector:
    return MockConnector(
        MockConnectorOptions(
            connector_id="oracle",
            capabilities=connector_capabilities(["oracle:create-purchase-order"]),
        )
    )
