"""
Mock SAP connector.

Deterministic, in-memory connector used until a real enterprise connector
is implemented.
"""

from __future__ import annotations

from ..metadata import ConnectorMetadata, ConnectorVersion, healthy_now
from ..mock_connector import MockConnector, MockConnectorOptions
from ..types import connector_capabilities

SapMetadata = ConnectorMetadata(
    connector_id="sap",
    display_name="SAP",
    version=ConnectorVersion(major=1, minor=0, patch=0),
    health=healthy_now(),
    description="Mock connector for SAP invoice execution.",
)


def create_sap_connector() -> MockConnector:
    return MockConnector(
        MockConnectorOptions(
            connector_id="sap",
            capabilities=connector_capabilities(["sap:post-invoice"]),
        )
    )
