# @parmana/connector-sdk

Contracts and reference implementations for building a Connector for [Parmana](https://github.com/pavancharak/parmana), the authorization layer for AI execution.

A Connector is the last hop in Parmana's pipeline: it receives an already-authorized, already-verified request and carries it out against a real system (an API, a database, anything). A Connector never evaluates policy, never authorizes execution, and never resolves its own credentials — it only executes, using a credential Parmana has already resolved for it.

## Install

```bash
npm install @parmana/connector-sdk
```

## The contract

Every Connector implements one interface:

```typescript
import type {
  Connector,
  ConnectorRequest,
  ConnectorExecutionContext,
  ConnectorResponse,
} from "@parmana/connector-sdk";

class MyConnector implements Connector {
  readonly connectorId = "my-service";
  readonly capabilities = connectorCapabilities(["my-service:do-thing"]);

  async execute(
    request: ConnectorRequest,
    context: ConnectorExecutionContext,
  ): Promise<ConnectorResponse> {
    // request.parameters is exactly what was authorized -- never re-derive it.
    // context.credential is an opaque, already-resolved CredentialHandle.
    // context.timeoutMs is how long you have.
    return { success: true, metadata: {} };
  }
}
```

`capabilities` must be namespaced verbs (`"namespace:verb"`, e.g. `"crm:update-contact"`), validated eagerly by `connectorCapabilities()` so a malformed capability fails at construction, not mid-execution.

## One reference implementation, for testing

`MockConnector` gives you scripted responses or failure injection, and records every request
it receives, so you can test your own Connector's callers without standing up a real endpoint:

```typescript
import { MockConnector, connectorCapabilities } from "@parmana/connector-sdk";

const connector = new MockConnector({
  connectorId: "billing",
  capabilities: connectorCapabilities(["billing:issue-refund"]),
  script: { respond: () => ({ success: true, metadata: { refundId: "r_1" } }) },
});

await connector.execute(request, context);
connector.invocations; // every request it received, for assertions
```

This package intentionally ships no HTTP-calling reference implementation — only the contract
and the hermetic mock above. A REST-shaped connector is usually this simple to write directly
against the contract:

```typescript
import type {
  Connector,
  ConnectorRequest,
  ConnectorExecutionContext,
  ConnectorResponse,
} from "@parmana/connector-sdk";
import { connectorCapabilities } from "@parmana/connector-sdk";

class BillingConnector implements Connector {
  readonly connectorId = "billing";
  readonly capabilities = connectorCapabilities(["billing:issue-refund"]);

  constructor(private readonly baseUrl: string) {}

  async execute(
    request: ConnectorRequest,
    context: ConnectorExecutionContext,
  ): Promise<ConnectorResponse> {
    const token = context.credential.value; // shape is whatever your CredentialProvider resolved
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), context.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/${request.action}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request.parameters),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { success: true, metadata: await response.json() };
    } finally {
      clearTimeout(timer);
    }
  }
}
```

## Four worked examples

`src/connectors/{oracle,salesforce,sap,workday}` are deterministic `MockConnector`s shaped like a real enterprise integration — each declares one realistic capability and nothing else. They are explicit mocks, not real integrations; read them as a template for structuring your own connector's capability and metadata, not as something to call in production.

## Credentials

A Connector never resolves its own credentials. `CredentialProvider` is the seam Parmana's Execution Gateway uses upstream of a Connector — `EnvironmentCredentialProvider` (reads a mapped env var) and `StaticCredentialProvider` (in-memory, for tests) are the two provided implementations.

## Full reference

See the [Connector SDK reference](https://docs.parmanasystems.com/reference/connector-sdk) and the [Connector Development Guide](https://docs.parmanasystems.com/integrations/connector-development-guide).
