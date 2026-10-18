import { MockConnector } from "../../MockConnector.js";

import { connectorCapabilities } from "../../ConnectorTypes.js";

/**
 * Mock SAP connector.
 *
 * Deterministic, in-memory connector used until the
 * real enterprise connector is implemented.
 */
export function createSapConnector(): MockConnector {
  return new MockConnector({
    connectorId: "sap",

    capabilities: connectorCapabilities(["sap:post-invoice"]),
  });
}
