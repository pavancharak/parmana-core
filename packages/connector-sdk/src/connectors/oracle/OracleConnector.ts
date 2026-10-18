import { MockConnector } from "../../MockConnector.js";

import { connectorCapabilities } from "../../ConnectorTypes.js";

/**
 * Mock Oracle connector.
 *
 * Deterministic, in-memory connector used until the
 * real enterprise connector is implemented.
 */
export function createOracleConnector(): MockConnector {
  return new MockConnector({
    connectorId: "oracle",

    capabilities: connectorCapabilities(["oracle:create-purchase-order"]),
  });
}
