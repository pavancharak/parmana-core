import type { ConnectorMetadata } from "@parmana/connector-sdk";
import { healthyNow } from "@parmana/connector-sdk";

/**
 * Metadata describing the HubSpot connector.
 *
 * This metadata is consumed by the SDK executor and ultimately becomes
 * part of the execution evidence.
 */
export const HubSpotMetadata: ConnectorMetadata = Object.freeze({
  connectorId: "hubspot",

  displayName: "HubSpot",

  version: Object.freeze({
    major: 1,
    minor: 0,
    patch: 0,
  }),

  health: healthyNow(),

  description:
    "HubSpot connector for Deal lookup and dealstage/amount update execution.",
});
