import type { ConnectorMetadata } from "../../ConnectorMetadata.js";

import { healthyNow } from "../../ConnectorMetadata.js";

/**
 * Metadata describing the Oracle connector.
 *
 * This metadata is consumed by the SDK executor and
 * ultimately becomes part of the execution evidence.
 */
export const OracleMetadata: ConnectorMetadata = Object.freeze({
  connectorId: "oracle",

  displayName: "Oracle",

  version: Object.freeze({
    major: 1,
    minor: 0,
    patch: 0,
  }),

  health: healthyNow(),

  description: "Mock connector for Oracle purchase order execution.",
});
