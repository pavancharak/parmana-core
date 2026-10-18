import type {
  ConnectorCapabilities,
  ConnectorIdentity,
  ConnectorPolicy,
  GatewayExecutionRequest,
} from "./types.js";

export class CapabilityConnectorPolicy implements ConnectorPolicy {
  allows(
    request: GatewayExecutionRequest,
    identity: ConnectorIdentity,
    capabilities: ConnectorCapabilities,
  ): boolean {
    return (
      request.connectorId === identity.connectorId &&
      capabilities.actions.includes(request.transaction.action) &&
      capabilities.targetPrefixes.some((prefix) =>
        request.transaction.target.startsWith(prefix),
      )
    );
  }
}
