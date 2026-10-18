/**
 * ExecutionGateway's connector-execution layer.
 *
 * Canonical production implementation of the connector-registration,
 * credential-backed execution, and execution-dispatch responsibilities
 * execution-control's seams (ConnectorRegistry, CredentialVault,
 * ConnectorExecutor) define. Migrated from @parmana/connector-sdk (Phase
 * 1C) — connector packages retain only capability definitions, schemas,
 * metadata, and interfaces; this is where those get wired into a real,
 * running execution path.
 *
 * Internal barrel (Phase 1D): this file is imported by the package's own
 * tests via a relative path, not through ../index.ts. The implementation
 * classes below (ConnectorEvidence, CredentialVaultAdapter,
 * SdkConnectorExecutor, GatewayCapabilityConnectorPolicy,
 * GatewayConnectorRegistry, GatewayHubSpotAdapter, GatewayHttpAdapter,
 * GatewayGitHubAdapter, GatewayPaytmAdapter, GatewaySlackAdapter,
 * GitHubAppCredentialProvider) are NOT re-exported from ../index.ts — the package's public surface is
 * the createGateway*() factories plus the GatewayConnectorRegistration
 * DTO, which construct and return these classes without exposing them.
 */

export * from "./ConnectorEvidence.js";
export * from "./CredentialVaultAdapter.js";
export * from "./SdkConnectorExecutor.js";
export * from "./GatewayCapabilityConnectorPolicy.js";
export * from "./GatewayConnectorRegistry.js";
export * from "./GatewayHubSpotAdapter.js";
export * from "./GatewayHttpAdapter.js";
export * from "./GatewayGitHubAdapter.js";
export * from "./GatewayPaytmAdapter.js";
export * from "./GatewaySlackAdapter.js";
export * from "./GitHubAppCredentialProvider.js";
export * from "./createGatewayConnectorRegistry.js";
export * from "./createGatewayHubSpotConnector.js";
export * from "./createGatewayGitHubConnector.js";
export * from "./createGatewayGitHubCredentialProvider.js";
export * from "./createGatewayPaytmConnector.js";
export * from "./createGatewaySlackConnector.js";
