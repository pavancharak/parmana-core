import type { ConnectorCapabilities } from "@parmana/connector-sdk";

/**
 * Slack capability identifiers and connector-configuration/parameter
 * DTOs. Pure metadata -- no execution logic. The executable connector
 * (GatewaySlackAdapter) lives in @parmana/execution-gateway and imports
 * these back from here, mirroring @parmana/connector-hubspot's split.
 *
 * Exactly one capability is declared: posting a message to a specific
 * Slack channel. There is no "slack:*" wildcard and no additional
 * Slack capability (channel creation, file upload, reaction, ...)
 * declared here -- adding one is a deliberate, separate change, not an
 * incidental side effect of this one.
 */
export const SLACK_POST_MESSAGE_CAPABILITY = "slack:post-message";

export interface SlackConnectorOptions {
  readonly connectorId: string;
  readonly capabilities: ConnectorCapabilities;

  /** Defaults to Slack's real Web API base URL; tests point this at a local MockSlackServer. */
  readonly baseUrl?: string;
}

export interface SlackPostMessageParameters {
  /** The Slack channel ID (or name) to post to. */
  readonly channel: string;
  /** The message text. */
  readonly text: string;
}
