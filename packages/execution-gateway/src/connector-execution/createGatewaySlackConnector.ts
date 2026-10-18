import type { Connector } from "@parmana/connector-sdk";
import type { SlackConnectorOptions } from "@parmana/connector-slack";

import { GatewaySlackAdapter } from "./GatewaySlackAdapter.js";

/**
 * Creates the production Slack Connector.
 *
 * Returns the stable Connector interface, not the concrete
 * GatewaySlackAdapter class -- callers never construct or depend on the
 * adapter implementation directly.
 */
export function createGatewaySlackConnector(
  options: SlackConnectorOptions,
): Connector {
  return new GatewaySlackAdapter(options);
}
