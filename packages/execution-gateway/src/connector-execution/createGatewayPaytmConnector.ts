import type { Connector } from "@parmana/connector-sdk";
import type { PaytmConnectorOptions } from "@parmana/connector-paytm";

import { GatewayPaytmAdapter } from "./GatewayPaytmAdapter.js";

/**
 * Creates the production Paytm Connector.
 *
 * Returns the stable Connector interface, not the concrete
 * GatewayPaytmAdapter class — callers never construct or depend on the
 * adapter implementation directly.
 */
export function createGatewayPaytmConnector(
  options: PaytmConnectorOptions,
): Connector {
  return new GatewayPaytmAdapter(options);
}
