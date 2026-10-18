"""
Enterprise reference mock connector unit tests.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from parmana_connector_sdk import (
    ConnectorExecutionContext,
    ConnectorRequest,
    ConnectorResponse,
    brand_credential_handle,
)
from parmana_connector_sdk.connectors.oracle import (
    OracleMetadata,
    create_oracle_connector,
)
from parmana_connector_sdk.connectors.salesforce import (
    SalesforceMetadata,
    create_salesforce_connector,
)
from parmana_connector_sdk.connectors.sap import SapMetadata, create_sap_connector
from parmana_connector_sdk.connectors.workday import (
    WorkdayMetadata,
    create_workday_connector,
)
from parmana_connector_sdk.credentials import CredentialHandle


def make_context() -> ConnectorExecutionContext:
    return ConnectorExecutionContext(
        credential=brand_credential_handle(
            CredentialHandle(
                provider_id="static", credential_id="erp", value={"token": "x"}
            )
        ),
        timeout_ms=1_000,
        requested_at=datetime.now(timezone.utc),
    )


def make_request(capability: str) -> ConnectorRequest:
    return ConnectorRequest(
        capability=capability,
        business_transaction_id="txn-1",
        action=capability,
        target="erp/record/1",
        parameters={},
    )


CASES = [
    ("SAP", create_sap_connector, SapMetadata, "sap:post-invoice"),
    ("Oracle", create_oracle_connector, OracleMetadata, "oracle:create-purchase-order"),
    (
        "Workday",
        create_workday_connector,
        WorkdayMetadata,
        "workday:submit-expense-report",
    ),
    (
        "Salesforce",
        create_salesforce_connector,
        SalesforceMetadata,
        "salesforce:update-opportunity",
    ),
]


@pytest.mark.parametrize(
    "name,create,metadata,capability", CASES, ids=[c[0] for c in CASES]
)
def test_declares_the_expected_connector_id_and_capability(
    name, create, metadata, capability
) -> None:
    connector = create()
    assert connector.connector_id == metadata.connector_id
    assert connector.capabilities.includes(capability)


@pytest.mark.parametrize(
    "name,create,metadata,capability", CASES, ids=[c[0] for c in CASES]
)
def test_executes_deterministically_given_a_resolved_credential_context(
    name, create, metadata, capability
) -> None:
    connector = create()
    response = connector.execute(make_request(capability), make_context())
    assert response == ConnectorResponse(success=True, metadata={})


@pytest.mark.parametrize(
    "name,create,metadata,capability", CASES, ids=[c[0] for c in CASES]
)
def test_rejects_a_capability_it_did_not_declare(
    name, create, metadata, capability
) -> None:
    connector = create()
    with pytest.raises(ValueError, match="does not declare capability"):
        connector.execute(make_request("other:capability"), make_context())
