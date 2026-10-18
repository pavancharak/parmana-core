import type { ConnectorCapabilities } from "@parmana/connector-sdk";

/**
 * HubSpot capability identifiers and connector-configuration/parameter
 * DTOs. Pure metadata — no execution logic. The executable connector
 * (GatewayHubSpotAdapter) lives in @parmana/execution-gateway and imports
 * these back from here (Phase 1C).
 */

export const HUBSPOT_DEAL_FETCH_CAPABILITY = "hubspot:deal-fetch";
export const HUBSPOT_DEAL_UPDATE_CAPABILITY = "hubspot:deal-update";

export interface HubSpotConnectorOptions {
  readonly connectorId: string;
  readonly capabilities: ConnectorCapabilities;

  /** Defaults to HubSpot's production base URL; tests point this at a local MockHubSpotServer. */
  readonly baseUrl?: string;
}

export interface HubSpotDealFetchParameters {
  readonly dealId: string;
}

export interface HubSpotDealUpdateParameters {
  readonly dealId: string;
  readonly dealstage?: string;
  readonly amount?: number;
}
