import type { ConnectorMetadata } from "@parmana/connector-sdk";
import { healthyNow } from "@parmana/connector-sdk";

/**
 * Metadata describing the GitHub connector.
 *
 * This metadata is consumed by the SDK executor and ultimately becomes
 * part of the execution evidence. Mirrors HubSpotMetadata.ts's own
 * precedent.
 */
export const GitHubMetadata: ConnectorMetadata = Object.freeze({
  connectorId: "github",

  displayName: "GitHub",

  version: Object.freeze({
    major: 1,
    minor: 0,
    patch: 0,
  }),

  health: healthyNow(),

  description: "GitHub connector for pull request fetch and merge execution.",
});
