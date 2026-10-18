import type { ConnectorCapabilities } from "@parmana/connector-sdk";

/**
 * GitHub capability identifiers and connector-configuration DTOs. Pure
 * metadata — no execution logic. The executable connector
 * (GatewayGitHubAdapter) lives in @parmana/execution-gateway and imports
 * these back from here, mirroring HubSpotCapabilities.ts's own precedent
 * (Phase 1C).
 */

export const GITHUB_PR_FETCH_CAPABILITY = "github:pr-fetch";
export const GITHUB_PR_MERGE_CAPABILITY = "github:pr-merge";

export interface GitHubConnectorOptions {
  readonly connectorId: string;
  readonly capabilities: ConnectorCapabilities;

  /** Defaults to GitHub's production API base URL; tests point this at a local MockGitHubServer. */
  readonly baseUrl?: string;
}
