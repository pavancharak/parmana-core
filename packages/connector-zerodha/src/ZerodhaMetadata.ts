import type { ConnectorMetadata } from "@parmana/connector-sdk";
import { healthyNow } from "@parmana/connector-sdk";

/**
 * Metadata describing the Zerodha connector. This slice declares no
 * executable behavior, so the health reported here means only that the
 * package loads.
 */
export const ZerodhaMetadata: ConnectorMetadata = Object.freeze({
  connectorId: "zerodha",

  displayName: "Zerodha Kite Connect",

  version: Object.freeze({
    major: 0,
    minor: 1,
    patch: 0,
  }),

  health: healthyNow(),

  description:
    "Zerodha Kite Connect connector. Passive in this release: capability identifiers and session helpers only. Places no orders.",
});
