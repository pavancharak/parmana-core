import { ConnectorNotRegisteredError } from "@parmana/shared";

import type { ConnectorRegistry, SecureConnector } from "./types.js";

export class InMemoryConnectorRegistry implements ConnectorRegistry {
  private readonly connectors = new Map<string, SecureConnector>();

  constructor(connectors: readonly SecureConnector[] = []) {
    for (const connector of connectors) {
      this.register(connector);
    }
  }

  register(connector: SecureConnector): void {
    if (this.connectors.has(connector.connectorId)) {
      throw new Error(
        `Connector already registered: ${connector.connectorId}.`,
      );
    }

    this.connectors.set(connector.connectorId, connector);
  }

  get(connectorId: string): SecureConnector {
    const connector = this.connectors.get(connectorId);

    if (!connector) {
      throw new Error(`Unknown connector: ${connectorId}.`);
    }

    return connector;
  }

  resolveCapability(capability: string): SecureConnector {
    for (const connector of this.connectors.values()) {
      if (connector.capabilities.includes(capability)) {
        return connector;
      }
    }

    throw new ConnectorNotRegisteredError(capability);
  }

  unregister(connectorId: string): void {
    if (!this.connectors.has(connectorId)) {
      throw new Error(`Unknown connector: ${connectorId}.`);
    }

    this.connectors.delete(connectorId);
  }

  list(): readonly SecureConnector[] {
    return [...this.connectors.values()];
  }
}
