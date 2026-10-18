import type { ConnectorMetadata } from "../../ConnectorMetadata.js";

import { healthyNow } from "../../ConnectorMetadata.js";

/**
 * Metadata describing the SAP connector.
 *
 * This metadata is consumed by the SDK executor and
 * ultimately becomes part of the execution evidence.
 */
export const SapMetadata: ConnectorMetadata = Object.freeze({
  connectorId: "sap",

  displayName: "SAP",

  version: Object.freeze({
    major: 1,
    minor: 0,
    patch: 0,
  }),

  health: healthyNow(),

  description: "Mock connector for SAP invoice execution.",
});
