import type { ConnectorMetadata } from "@parmana/connector-sdk";
import { healthyNow } from "@parmana/connector-sdk";

/**
 * Metadata describing the Slack connector.
 *
 * This metadata is consumed by the SDK executor and ultimately becomes
 * part of the execution evidence.
 */
export const SlackMetadata: ConnectorMetadata = Object.freeze({
  connectorId: "slack",

  displayName: "Slack",

  version: Object.freeze({
    major: 1,
    minor: 0,
    patch: 0,
  }),

  health: healthyNow(),

  description:
    "Slack connector for posting a message to a channel via chat.postMessage.",
});
