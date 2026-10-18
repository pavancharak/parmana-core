import type { Connector } from "@parmana/connector-sdk";
import type { GitHubConnectorOptions } from "@parmana/connector-github";

import { GatewayGitHubAdapter } from "./GatewayGitHubAdapter.js";

/**
 * Creates the production GitHub Connector.
 *
 * Returns the stable Connector interface, not the concrete
 * GatewayGitHubAdapter class — callers never construct or depend on the
 * adapter implementation directly. Mirrors createGatewayHubSpotConnector.ts.
 */
export function createGatewayGitHubConnector(
  options: GitHubConnectorOptions,
): Connector {
  return new GatewayGitHubAdapter(options);
}
