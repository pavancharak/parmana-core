import { SLACK_POST_MESSAGE_CAPABILITY } from "@parmana/connector-slack";
import { connectorCapabilities, type Connector } from "@parmana/connector-sdk";
import { readConnectorBaseUrl } from "./readConnectorBaseUrl.js";
import { createGatewaySlackConnector } from "@parmana/execution-gateway";

/**
 * Creates the Slack connector.
 *
 * baseUrl defaults to the Gateway's own default (Slack's real
 * production API) unless SLACK_BASE_URL is explicitly set. That
 * variable exists solely as a test seam so a tutorial or integration
 * test can point this connector at a hermetic MockSlackServer instead
 * -- it is never set in production, so production traffic reaches the
 * real Slack API unless an operator deliberately opts out.
 */
export function createSlackConnector(): Connector {
  const baseUrl = readConnectorBaseUrl("SLACK_BASE_URL");

  return createGatewaySlackConnector({
    connectorId: "slack",

    capabilities: connectorCapabilities([SLACK_POST_MESSAGE_CAPABILITY]),

    ...(baseUrl !== undefined ? { baseUrl } : {}),
  });
}
