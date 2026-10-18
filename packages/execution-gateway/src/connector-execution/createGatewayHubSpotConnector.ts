import type { Connector } from "@parmana/connector-sdk";
import type { HubSpotConnectorOptions } from "@parmana/connector-hubspot";

import { GatewayHubSpotAdapter } from "./GatewayHubSpotAdapter.js";

/**
 * Creates the production HubSpot Connector.
 *
 * Returns the stable Connector interface, not the concrete
 * GatewayHubSpotAdapter class — callers never construct or depend on the
 * adapter implementation directly.
 */
export function createGatewayHubSpotConnector(
  options: HubSpotConnectorOptions,
): Connector {
  return new GatewayHubSpotAdapter(options);
}
