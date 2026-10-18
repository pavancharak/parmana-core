import { CryptoBootstrap } from "@parmana/crypto";
import type { ConnectorIdentity } from "@parmana/execution-control";
import {
  DefaultConnectorPolicy,
  InMemoryConnectorAuthenticator,
  InMemoryGatewaySessionStore,
} from "@parmana/execution-control";
import {
  MockConnector,
  StaticCredentialProvider,
  connectorCapabilities,
  healthyNow,
  type ConnectorMetadata,
} from "@parmana/connector-sdk";
import { describe, expect, it } from "vitest";

import { GatewayConnectorRegistry } from "../../src/connector-execution/index.js";

const crypto = CryptoBootstrap.create();

function fixtureConnector(connectorId: string) {
  return new MockConnector({
    connectorId,
    capabilities: connectorCapabilities(["crm:read"]),
  });
}

function fixtureMetadata(connectorId: string): ConnectorMetadata {
  return {
    connectorId,
    displayName: connectorId,
    version: { major: 1, minor: 0, patch: 0 },
    health: healthyNow(),
  };
}

function fixtureRegistration(connectorId: string) {
  const gatewayIdentity = {
    gatewayId: "gateway-1",
    publicIdentity: "spiffe://parmana/gateway",
    authenticationMetadata: {},
  };
  const connectorIdentity: ConnectorIdentity = {
    connectorId,
    publicIdentity: `spiffe://parmana/connectors/${connectorId}`,
    authenticationMetadata: {},
  };
  const gatewayAuthentication = Object.freeze({ token: "gw-token" });
  const authenticator = new InMemoryConnectorAuthenticator(
    gatewayIdentity,
    gatewayAuthentication,
    [connectorIdentity],
  );
  const sessions = new InMemoryGatewaySessionStore(
    Object.freeze({ capability: "session-issuer" }),
  );
  const policy = new DefaultConnectorPolicy(authenticator, sessions);
  const credentialProvider = new StaticCredentialProvider({
    [connectorId]: { token: "secret" },
  });

  return {
    connector: fixtureConnector(connectorId),
    metadata: fixtureMetadata(connectorId),
    connectorIdentity,
    credentialProvider,
    policy,
    gatewayAuthentication,
    crypto,
    //
    // This suite tests registry mechanics (registration, duplicates,
    // entry()/list()), not credential-isolation semantics — opting out
    // of the session-credential path keeps it focused, per the explicit
    // legacyInsecure escape hatch.
    //
    legacyInsecure: true,
  };
}

describe("GatewayConnectorRegistry", () => {
  it("registers a connector and exposes it through the execution-control ConnectorRegistry interface", () => {
    const registry = new GatewayConnectorRegistry();
    const registration = fixtureRegistration("stripe");

    registry.register(registration);

    const secureConnector = registry.get("stripe");
    expect(secureConnector.connectorId).toBe("stripe");
    expect(secureConnector.capabilities).toEqual(["crm:read"]);
  });

  it("exposes registered metadata and connector via entry()/list()", () => {
    const registry = new GatewayConnectorRegistry();
    const registration = fixtureRegistration("stripe");
    registry.register(registration);

    const entry = registry.entry("stripe");
    expect(entry.connector).toBe(registration.connector);
    expect(entry.metadata.version).toEqual({ major: 1, minor: 0, patch: 0 });
    expect(registry.list()).toHaveLength(1);
  });

  it("rejects duplicate registration", () => {
    const registry = new GatewayConnectorRegistry();
    registry.register(fixtureRegistration("stripe"));
    expect(() => registry.register(fixtureRegistration("stripe"))).toThrow(
      "Connector already registered: stripe.",
    );
  });

  it("rejects lookups of unknown connectors", () => {
    const registry = new GatewayConnectorRegistry();
    expect(() => registry.get("sap")).toThrow("Unknown connector");
    expect(() => registry.entry("sap")).toThrow("Unknown connector: sap.");
  });
});
