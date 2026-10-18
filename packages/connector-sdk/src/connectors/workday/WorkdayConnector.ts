import { MockConnector } from "../../MockConnector.js";

import { connectorCapabilities } from "../../ConnectorTypes.js";

/**
 * Mock Workday connector.
 *
 * Deterministic, in-memory connector used until the
 * real enterprise connector is implemented.
 */
export function createWorkdayConnector(): MockConnector {
  return new MockConnector({
    connectorId: "workday",

    capabilities: connectorCapabilities(["workday:submit-expense-report"]),
  });
}
