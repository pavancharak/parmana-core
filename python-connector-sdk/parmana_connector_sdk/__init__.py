"""
Parmana Connector SDK (Python).

Connector authoring contracts: capability definitions, DTOs, metadata, and
the Connector/CredentialProvider protocols. Passive by design -- this
package describes capabilities, it does not execute them for real. No
HTTP-calling reference implementation ships from this package; see the
README for why, and for how short a real connector is to write directly
against the Connector protocol.

Mirrors the TypeScript @parmana/connector-sdk package's shape; see that
package for the canonical design rationale behind each contract.
"""

from .connectors.oracle import OracleMetadata, create_oracle_connector
from .connectors.salesforce import SalesforceMetadata, create_salesforce_connector
from .connectors.sap import SapMetadata, create_sap_connector
from .connectors.workday import WorkdayMetadata, create_workday_connector
from .credentials import (
    CredentialHandle,
    CredentialProvider,
    EnvironmentCredentialProvider,
    StaticCredentialProvider,
    brand_credential_handle,
    is_credential_handle,
)
from .factory import ConnectorFactory
from .metadata import (
    ConnectorHealth,
    ConnectorHealthStatus,
    ConnectorMetadata,
    ConnectorVersion,
    connector_versions_equal,
    format_connector_version,
    healthy_now,
)
from .mock_connector import MockConnector, MockConnectorOptions, MockConnectorScript
from .types import (
    Connector,
    ConnectorCapabilities,
    ConnectorCapability,
    ConnectorExecutionContext,
    ConnectorRequest,
    ConnectorResponse,
    connector_capabilities,
    is_namespaced_capability,
)
from .version import __version__

__all__ = [
    "__version__",
    # Contract
    "Connector",
    "ConnectorCapability",
    "ConnectorCapabilities",
    "ConnectorExecutionContext",
    "ConnectorRequest",
    "ConnectorResponse",
    "connector_capabilities",
    "is_namespaced_capability",
    "ConnectorFactory",
    # Metadata
    "ConnectorHealth",
    "ConnectorHealthStatus",
    "ConnectorMetadata",
    "ConnectorVersion",
    "connector_versions_equal",
    "format_connector_version",
    "healthy_now",
    # Credentials
    "CredentialHandle",
    "CredentialProvider",
    "EnvironmentCredentialProvider",
    "StaticCredentialProvider",
    "brand_credential_handle",
    "is_credential_handle",
    # Reference implementation
    "MockConnector",
    "MockConnectorOptions",
    "MockConnectorScript",
    # Four enterprise-named reference mocks
    "OracleMetadata",
    "create_oracle_connector",
    "SalesforceMetadata",
    "create_salesforce_connector",
    "SapMetadata",
    "create_sap_connector",
    "WorkdayMetadata",
    "create_workday_connector",
]
