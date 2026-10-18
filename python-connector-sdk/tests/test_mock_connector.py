"""
MockConnector unit tests.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from parmana_connector_sdk import (
    ConnectorExecutionContext,
    ConnectorRequest,
    ConnectorResponse,
    MockConnector,
    MockConnectorOptions,
    MockConnectorScript,
    brand_credential_handle,
    connector_capabilities,
)
from parmana_connector_sdk.credentials import CredentialHandle


def make_context() -> ConnectorExecutionContext:
    return ConnectorExecutionContext(
        credential=brand_credential_handle(
            CredentialHandle(
                provider_id="static", credential_id="crm", value={"token": "x"}
            )
        ),
        timeout_ms=1_000,
        requested_at=datetime.now(timezone.utc),
    )


def make_request(**overrides: object) -> ConnectorRequest:
    defaults = dict(
        capability="crm:read",
        business_transaction_id="txn-1",
        action="crm:read",
        target="crm/contacts/1",
        parameters={},
    )
    defaults.update(overrides)
    return ConnectorRequest(**defaults)  # type: ignore[arg-type]


def test_returns_default_deterministic_success_with_no_script_configured() -> None:
    connector = MockConnector(
        MockConnectorOptions(
            connector_id="crm", capabilities=connector_capabilities(["crm:read"])
        )
    )
    response = connector.execute(make_request(), make_context())
    assert response == ConnectorResponse(success=True, metadata={})


def test_records_every_request_it_receives() -> None:
    connector = MockConnector(
        MockConnectorOptions(
            connector_id="crm", capabilities=connector_capabilities(["crm:read"])
        )
    )
    connector.execute(make_request(), make_context())
    connector.execute(make_request(business_transaction_id="txn-2"), make_context())
    assert len(connector.invocations) == 2
    assert connector.invocations[1].business_transaction_id == "txn-2"


def test_returns_a_scripted_response() -> None:
    connector = MockConnector(
        MockConnectorOptions(
            connector_id="crm",
            capabilities=connector_capabilities(["crm:read"]),
            script=MockConnectorScript(
                respond=lambda request, context: ConnectorResponse(
                    success=True, metadata={"record_id": "contact-1"}
                )
            ),
        )
    )
    response = connector.execute(make_request(), make_context())
    assert response.metadata == {"record_id": "contact-1"}


def test_injects_a_scripted_failure() -> None:
    connector = MockConnector(
        MockConnectorOptions(
            connector_id="crm",
            capabilities=connector_capabilities(["crm:read"]),
            script=MockConnectorScript(
                fail_with=RuntimeError("upstream CRM unavailable")
            ),
        )
    )
    with pytest.raises(RuntimeError, match="upstream CRM unavailable"):
        connector.execute(make_request(), make_context())


def test_rejects_a_capability_it_did_not_declare() -> None:
    connector = MockConnector(
        MockConnectorOptions(
            connector_id="crm", capabilities=connector_capabilities(["crm:read"])
        )
    )
    with pytest.raises(ValueError, match='does not declare capability "crm:delete"'):
        connector.execute(
            make_request(capability="crm:delete", action="crm:delete"), make_context()
        )
