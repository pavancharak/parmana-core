import {
  GITHUB_PR_FETCH_CAPABILITY,
  GITHUB_PR_MERGE_CAPABILITY,
} from "@parmana/connector-github";
import { connectorCapabilities, type Connector } from "@parmana/connector-sdk";
import { readConnectorBaseUrl } from "./readConnectorBaseUrl.js";
import { createGatewayGitHubConnector } from "@parmana/execution-gateway";

/**
 * Creates the GitHub connector.
 *
 * baseUrl defaults to the Gateway's own default (GitHub's real production
 * API, https://api.github.com) unless GITHUB_BASE_URL is explicitly set.
 * That variable exists solely as a test seam so an integration test can
 * point this connector at a hermetic MockGitHubServer instead — it is
 * never set in production, so production traffic reaches the real GitHub
 * API unless an operator deliberately opts out. Mirrors
 * createHubSpotConnector.ts's HUBSPOT_BASE_URL seam exactly.
 */
export function createGitHubConnector(): Connector {
  const baseUrl = readConnectorBaseUrl("GITHUB_BASE_URL");

  return createGatewayGitHubConnector({
    connectorId: "github",

    capabilities: connectorCapabilities([
      GITHUB_PR_FETCH_CAPABILITY,
      GITHUB_PR_MERGE_CAPABILITY,
    ]),

    ...(baseUrl !== undefined ? { baseUrl } : {}),
  });
}
