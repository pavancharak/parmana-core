import type { ConnectorMetadata } from "@parmana/connector-sdk";
import { healthyNow } from "@parmana/connector-sdk";

/**
 * Metadata describing the Paytm connector.
 *
 * This metadata is consumed by the SDK executor and ultimately becomes
 * part of the execution evidence.
 */
export const PaytmMetadata: ConnectorMetadata = Object.freeze({
  connectorId: "paytm",

  displayName: "Paytm",

  version: Object.freeze({
    major: 1,
    minor: 0,
    patch: 0,
  }),

  health: healthyNow(),

  description:
    "Paytm refund connector: forwards Parmana-authorized paytm:refund executions to the trusted, out-of-process Paytm connector service. Never calls Paytm directly.",
});
