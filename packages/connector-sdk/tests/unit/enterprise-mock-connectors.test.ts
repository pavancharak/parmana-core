import { describe, expect, it } from "vitest";

import {
  brandCredentialHandle,
  type ConnectorExecutionContext,
  type ConnectorRequest,
} from "../../src/index.js";

import {
  createSapConnector,
  SapMetadata,
} from "../../src/connectors/sap/index.js";
import {
  createOracleConnector,
  OracleMetadata,
} from "../../src/connectors/oracle/index.js";
import {
  createWorkdayConnector,
  WorkdayMetadata,
} from "../../src/connectors/workday/index.js";
import {
  createSalesforceConnector,
  SalesforceMetadata,
} from "../../src/connectors/salesforce/index.js";

function context(): ConnectorExecutionContext {
  return {
    credential: brandCredentialHandle({
      providerId: "static",
      credentialId: "erp",
      value: { token: "x" },
    }),
    timeoutMs: 1_000,
    requestedAt: new Date(),
  };
}

function request(capability: string): ConnectorRequest {
  return {
    capability,
    businessTransactionId: "txn-1",
    action: capability,
    target: "erp/record/1",
    parameters: {},
  };
}

describe.each([
  {
    name: "SAP",
    create: createSapConnector,
    metadata: SapMetadata,
    capability: "sap:post-invoice",
  },
  {
    name: "Oracle",
    create: createOracleConnector,
    metadata: OracleMetadata,
    capability: "oracle:create-purchase-order",
  },
  {
    name: "Workday",
    create: createWorkdayConnector,
    metadata: WorkdayMetadata,
    capability: "workday:submit-expense-report",
  },
  {
    name: "Salesforce",
    create: createSalesforceConnector,
    metadata: SalesforceMetadata,
    capability: "salesforce:update-opportunity",
  },
])("$name mock connector", ({ create, metadata, capability }) => {
  it("declares the expected connectorId and capability", () => {
    const connector = create();
    expect(connector.connectorId).toBe(metadata.connectorId);
    expect(connector.capabilities.includes(capability)).toBe(true);
  });

  it("executes deterministically given a resolved credential context", async () => {
    const connector = create();
    const response = await connector.execute(request(capability), context());
    expect(response).toEqual({ success: true, metadata: {} });
  });

  it("rejects a capability it did not declare", async () => {
    const connector = create();
    await expect(
      connector.execute(request("other:capability"), context()),
    ).rejects.toThrow("does not declare capability");
  });
});
