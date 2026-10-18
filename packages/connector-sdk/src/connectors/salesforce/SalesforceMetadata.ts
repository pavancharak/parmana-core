import type { ConnectorMetadata } from "../../ConnectorMetadata.js";

import { healthyNow } from "../../ConnectorMetadata.js";

/**
 * Metadata describing the Salesforce connector.
 *
 * This metadata is consumed by the SDK executor and
 * ultimately becomes part of the execution evidence.
 */
export const SalesforceMetadata: ConnectorMetadata = Object.freeze({
  connectorId: "salesforce",

  displayName: "Salesforce",

  version: Object.freeze({
    major: 1,
    minor: 0,
    patch: 0,
  }),

  health: healthyNow(),

  description: "Mock connector for Salesforce opportunity execution.",
});
