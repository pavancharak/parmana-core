import {
  HUBSPOT_DEAL_FETCH_CAPABILITY,
  HUBSPOT_DEAL_UPDATE_CAPABILITY,
} from "@parmana/connector-hubspot";
import { connectorCapabilities, type Connector } from "@parmana/connector-sdk";
import { readConnectorBaseUrl } from "./readConnectorBaseUrl.js";
import { createGatewayHubSpotConnector } from "@parmana/execution-gateway";

/**
 * Creates the HubSpot connector.
 *
 * baseUrl defaults to the Gateway's own default (HubSpot's real
 * production API) unless HUBSPOT_BASE_URL is explicitly set. That
 * variable exists solely as a test seam so an integration test can point
 * this connector at a hermetic MockHubSpotServer instead — it is never
 * set in production, so production traffic reaches the real HubSpot API
 * unless an operator deliberately opts out.
 */
export function createHubSpotConnector(): Connector {
  const baseUrl = readConnectorBaseUrl("HUBSPOT_BASE_URL");

  return createGatewayHubSpotConnector({
    connectorId: "hubspot",

    capabilities: connectorCapabilities([
      HUBSPOT_DEAL_FETCH_CAPABILITY,
      HUBSPOT_DEAL_UPDATE_CAPABILITY,
    ]),

    ...(baseUrl !== undefined ? { baseUrl } : {}),
  });
}
