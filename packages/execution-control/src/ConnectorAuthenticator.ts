import type {
  ConnectorAuthenticator,
  ConnectorIdentity,
  GatewayIdentity,
} from "./types.js";

export class InMemoryConnectorAuthenticator implements ConnectorAuthenticator {
  constructor(
    private readonly gateway: GatewayIdentity,
    private readonly gatewayAuthentication: unknown,
    private readonly connectorIdentities: readonly ConnectorIdentity[],
  ) {}

  authenticateGateway(
    identity: GatewayIdentity,
    authentication: unknown,
  ): boolean {
    return (
      authentication === this.gatewayAuthentication &&
      identity.gatewayId === this.gateway.gatewayId &&
      identity.publicIdentity === this.gateway.publicIdentity
    );
  }

  authenticateConnector(identity: ConnectorIdentity): boolean {
    return this.connectorIdentities.some(
      (trusted) =>
        trusted.connectorId === identity.connectorId &&
        trusted.publicIdentity === identity.publicIdentity,
    );
  }
}
