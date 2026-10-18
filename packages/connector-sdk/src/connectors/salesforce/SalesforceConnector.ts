import { MockConnector } from "../../MockConnector.js";

import { connectorCapabilities } from "../../ConnectorTypes.js";

/**
 * Mock Salesforce connector.
 *
 * Deterministic, in-memory connector used until the
 * real enterprise connector is implemented.
 */
export function createSalesforceConnector(): MockConnector {
  return new MockConnector({
    connectorId: "salesforce",

    capabilities: connectorCapabilities(["salesforce:update-opportunity"]),
  });
}
