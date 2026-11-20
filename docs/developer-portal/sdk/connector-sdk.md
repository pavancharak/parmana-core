# Connector SDK: `@parmana/connector-sdk` and `parmana-connector-sdk`

[SDKs](README.md) · [Architecture](../architecture.md)

A **connector** is the component that performs the business call once Parmana has released a request. It receives a request that has already been authorized and verified, and it carries out the action against a real system. Connectors are not called by applications. Parmana's execution gateway calls them, with signed releases only.

Connector implementations live in the separate `parmana-connectors` repository, and each one runs as an external service. This page documents only the authoring contract, and the parts of it that were checked in this verification.

|          |                                                                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Packages | `@parmana/connector-sdk` (npm, 4.1.1) · `parmana-connector-sdk` (PyPI, 4.1.1)                                                            |
| Status   | Published. The Python import surface was checked. The release path (signed release, execution gateway) was not exercised by this portal. |

## Install

```bash
npm install @parmana/connector-sdk@4.1.1
pip install "parmana-connector-sdk==4.1.1"
```

## The Python contract

Every connector implements one protocol: `connector_id`, `capabilities`, and `execute`. A connector does not subclass anything.

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
        # request.parameters is exactly what was authorized. Never re-derive it.
        # context.credential is an opaque, already-resolved credential handle.
        # context.timeout_ms is how long you have.
        return ConnectorResponse(success=True, metadata={})
```

This is an illustrative skeleton. Its imports were checked against the published package. The `execute` body is a placeholder that does no business work.

Verified in this portal: the imports resolve from PyPI, and `connector_capabilities(["not a verb"])` raises `ValueError`. A capability must be a namespaced verb such as `my-service:do-thing`, and a malformed one fails at construction, not during execution.

`MockConnector` and `MockConnectorOptions` are provided for tests. They return scripted responses or inject failures, and record each request.

## Rules the contract sets (from the connector SDK's README)

- A connector **never evaluates policy** and **never authorizes execution**. Parmana does both before it releases a request.
- A connector **never resolves its own credentials**. It uses the credential Parmana has already resolved, in `context.credential`.
- Run **exactly the authorized parameters** in `request.parameters`. Do not re-derive them.
- Respect **`context.timeout_ms`**.
- Declare capabilities as namespaced verbs (`namespace:verb`). A malformed capability fails at construction.

The TypeScript package exports the same contract: `ConnectorTypes`, `ConnectorMetadata`, `ConnectorFactory`, `CredentialProvider`, and `MockConnector`, plus connector implementations under `connectors/`.
