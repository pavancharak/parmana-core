import { describe, expect, it } from "vitest";

import {
  MockConnector,
  brandCredentialHandle,
  connectorCapabilities,
  type ConnectorExecutionContext,
  type ConnectorRequest,
} from "../../src/index.js";

function context(): ConnectorExecutionContext {
  return {
    credential: brandCredentialHandle({
      providerId: "static",
      credentialId: "crm",
      value: { token: "x" },
    }),
    timeoutMs: 1_000,
    requestedAt: new Date(),
  };
}

function request(overrides: Partial<ConnectorRequest> = {}): ConnectorRequest {
  return {
    capability: "crm:read",
    businessTransactionId: "txn-1",
    action: "crm:read",
    target: "crm/contacts/1",
    parameters: {},
    ...overrides,
  };
}

describe("MockConnector", () => {
  it("returns a default deterministic success response with no script configured", async () => {
    const connector = new MockConnector({
      connectorId: "crm",
      capabilities: connectorCapabilities(["crm:read"]),
    });
    const response = await connector.execute(request(), context());
    expect(response).toEqual({ success: true, metadata: {} });
  });

  it("records every request it receives", async () => {
    const connector = new MockConnector({
      connectorId: "crm",
      capabilities: connectorCapabilities(["crm:read"]),
    });
    await connector.execute(request(), context());
    await connector.execute(
      request({ businessTransactionId: "txn-2" }),
      context(),
    );
    expect(connector.invocations).toHaveLength(2);
    expect(connector.invocations[1]?.businessTransactionId).toBe("txn-2");
  });

  it("returns a scripted response", async () => {
    const connector = new MockConnector({
      connectorId: "crm",
      capabilities: connectorCapabilities(["crm:read"]),
      script: {
        respond: () => ({ success: true, metadata: { recordId: "contact-1" } }),
      },
    });
    const response = await connector.execute(request(), context());
    expect(response.metadata).toEqual({ recordId: "contact-1" });
  });

  it("injects a scripted failure", async () => {
    const connector = new MockConnector({
      connectorId: "crm",
      capabilities: connectorCapabilities(["crm:read"]),
      script: { failWith: new Error("upstream CRM unavailable") },
    });
    await expect(connector.execute(request(), context())).rejects.toThrow(
      "upstream CRM unavailable",
    );
  });

  it("rejects a capability it did not declare", async () => {
    const connector = new MockConnector({
      connectorId: "crm",
      capabilities: connectorCapabilities(["crm:read"]),
    });
    await expect(
      connector.execute(
        request({ capability: "crm:delete", action: "crm:delete" }),
        context(),
      ),
    ).rejects.toThrow('does not declare capability "crm:delete"');
  });
});
