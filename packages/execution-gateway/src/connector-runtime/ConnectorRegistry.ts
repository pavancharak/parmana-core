import type { SecureConnector } from "./types.js";

export interface ConnectorRegistry {
  get(connectorId: string): SecureConnector | undefined;
}

export class InMemoryConnectorRegistry implements ConnectorRegistry {
  private readonly connectors = new Map<string, SecureConnector>();

  register(connector: SecureConnector): void {
    if (this.connectors.has(connector.identity.connectorId)) {
      throw new Error(
        `Connector already registered: ${connector.identity.connectorId}.`,
      );
    }
    this.connectors.set(connector.identity.connectorId, connector);
  }

  get(connectorId: string): SecureConnector | undefined {
    return this.connectors.get(connectorId);
  }
}
