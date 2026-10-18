# parmana-connector-sdk

Contracts and reference implementations for building a Connector for [Parmana](https://github.com/pavancharak/parmana), the authorization layer for AI execution.

A Connector is the last hop in Parmana's pipeline: it receives an already-authorized, already-verified request and carries it out against a real system (an API, a database, anything). A Connector never evaluates policy, never authorizes execution, and never resolves its own credentials — it only executes, using a credential Parmana has already resolved for it.

This is the Python counterpart to the TypeScript [`@parmana/connector-sdk`](https://www.npmjs.com/package/@parmana/connector-sdk) package — same contract, same design, idiomatic Python (synchronous, dataclasses and `Protocol` instead of interfaces).

## Install

```bash
pip install parmana-connector-sdk
```

## The contract

Every Connector implements one protocol:

```python
from parmana_connector_sdk import (
    Connector,
    ConnectorRequest,
    ConnectorExecutionContext,
    ConnectorResponse,
    connector_capabilities,
)


class MyConnector:
    connector_id = "my-service"
    capabilities = connector_capabilities(["my-service:do-thing"])

    def execute(
        self, request: ConnectorRequest, context: ConnectorExecutionContext
    ) -> ConnectorResponse:
        # request.parameters is exactly what was authorized -- never re-derive it.
        # context.credential is an opaque, already-resolved CredentialHandle.
        # context.timeout_ms is how long you have.
        return ConnectorResponse(success=True, metadata={})
```

`Connector` is a `typing.Protocol` — `MyConnector` doesn't need to subclass anything, it just
needs to match the shape (`connector_id`, `capabilities`, `execute`).

`capabilities` must be namespaced verbs (`"namespace:verb"`, e.g. `"crm:update-contact"`),
validated eagerly by `connector_capabilities()` so a malformed capability fails at
construction, not mid-execution.

## One reference implementation, for testing

`MockConnector` gives you scripted responses or failure injection, and records every request
it receives, so you can test your own Connector's callers without standing up a real endpoint:

```python
from parmana_connector_sdk import MockConnector, MockConnectorOptions, MockConnectorScript, connector_capabilities

connector = MockConnector(
    MockConnectorOptions(
        connector_id="billing",
        capabilities=connector_capabilities(["billing:issue-refund"]),
        script=MockConnectorScript(
            respond=lambda request, context: ConnectorResponse(
                success=True, metadata={"refund_id": "r_1"}
            )
        ),
    )
)

connector.execute(request, context)
connector.invocations  # every request it received, for assertions
```

This package intentionally ships no HTTP-calling reference implementation — only the contract
and the hermetic mock above. A REST-shaped connector is usually this simple to write directly
against the contract:

```python
import urllib.request
import json

from parmana_connector_sdk import (
    ConnectorRequest,
    ConnectorExecutionContext,
    ConnectorResponse,
    connector_capabilities,
)


class BillingConnector:
    connector_id = "billing"
    capabilities = connector_capabilities(["billing:issue-refund"])

    def __init__(self, base_url: str) -> None:
        self.base_url = base_url

    def execute(
        self, request: ConnectorRequest, context: ConnectorExecutionContext
    ) -> ConnectorResponse:
        token = context.credential.value  # shape is whatever your CredentialProvider resolved
        body = json.dumps(request.parameters).encode()
        req = urllib.request.Request(
            f"{self.base_url}/{request.action}",
            data=body,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=context.timeout_ms / 1000) as response:
            if response.status >= 300:
                raise RuntimeError(f"HTTP {response.status}")
            return ConnectorResponse(success=True, metadata=json.load(response))
```

## Four worked examples

`parmana_connector_sdk.connectors.{oracle,salesforce,sap,workday}` are deterministic
`MockConnector`s shaped like a real enterprise integration — each declares one realistic
capability and nothing else. They are explicit mocks, not real integrations; read them as a
template for structuring your own connector's capability and metadata, not as something to
call in production.

## Credentials

A Connector never resolves its own credentials. `CredentialProvider` is the seam Parmana's
Execution Gateway uses upstream of a Connector — `EnvironmentCredentialProvider` (reads a
mapped env var) and `StaticCredentialProvider` (in-memory, for tests) are the two provided
implementations.

## Full reference

See the [Connector SDK reference](https://docs.parmanasystems.com/reference/connector-sdk) and
the [Connector Development Guide](https://docs.parmanasystems.com/integrations/connector-development-guide)
— written against the TypeScript package, but the contract this package implements is
identical.
