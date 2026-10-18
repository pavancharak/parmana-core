import { CryptoBootstrap } from "@parmana/crypto";
import type {
  ConnectorIdentity,
  ConnectorPolicy,
  GatewayExecutionRequest,
  SecureConnector,
} from "@parmana/execution-control";
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
import { ConnectorNotRegisteredError } from "@parmana/shared";
import { describe, expect, it, vi } from "vitest";

import { ExternalConnectorAwareRegistry } from "../../src/connector-execution/ExternalConnectorAwareRegistry.js";
import type { ActiveExternalConnector } from "../../src/connector-execution/ExternalConnectorAwareRegistry.js";
import { GatewayCapabilityConnectorPolicy } from "../../src/connector-execution/GatewayCapabilityConnectorPolicy.js";
import { GatewayConnectorRegistry } from "../../src/connector-execution/index.js";

/**
 * The registry the server uses once external connectors exist, and the
 * capability check every connector's policy is wrapped in. Mutation
 * testing found neither tested in this package (0%): only the API's
 * integration tests reached them, through the built package. These pin
 * which connector serves a capability, and that a registration for
 * another capability is never used.
 */

const crypto = CryptoBootstrap.create();

function fixtureConnector(connectorId: string, capability = "crm:read") {
  return new MockConnector({
    connectorId,
    capabilities: connectorCapabilities([capability]),
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

function fixtureRegistration(connectorId: string, capability = "crm:read") {
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
    connector: fixtureConnector(connectorId, capability),
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

const registration = (
  overrides: Partial<ActiveExternalConnector> = {},
): ActiveExternalConnector => ({
  registrationId: "reg-1",
  capability: "erp:create-invoice",
  endpointUrl: "https://erp.example.com/release",
  allowedParameters: ["amount"],
  timeoutMs: 1000,
  ...overrides,
});

function setup(found: ActiveExternalConnector | null) {
  const builtIn = new GatewayConnectorRegistry();
  builtIn.register(fixtureRegistration("hubspot", "crm:read"));
  const findActive = vi.fn(async () => found);
  const build = vi.fn((active: ActiveExternalConnector) =>
    fixtureRegistration(`ext-${active.capability}`, active.capability),
  );
  const registry = new ExternalConnectorAwareRegistry(builtIn, {
    findActive,
    build,
  });
  return { registry, findActive, build };
}

describe("ExternalConnectorAwareRegistry", () => {
  it("serves a capability a built in connector has, without reading registrations", async () => {
    const { registry, findActive } = setup(registration());

    const connector = await registry.resolveCapability("crm:read");

    expect(connector.connectorId).toBe("hubspot");
    expect(findActive).not.toHaveBeenCalled();
  });

  it("builds an active registration's connector once, and finds it by id after", async () => {
    const { registry, findActive, build } = setup(registration());

    const first = await registry.resolveCapability("erp:create-invoice");
    const second = await registry.resolveCapability("erp:create-invoice");

    expect(first.connectorId).toBe("ext-erp:create-invoice");
    expect(second).toBe(first);
    expect(build).toHaveBeenCalledTimes(1);
    expect(findActive).toHaveBeenCalledTimes(2);
    expect(registry.get("ext-erp:create-invoice")).toBe(first);
    expect(registry.get("hubspot").connectorId).toBe("hubspot");
  });

  it("refuses when no registration is active", async () => {
    const { registry, build } = setup(null);

    await expect(
      registry.resolveCapability("erp:create-invoice"),
    ).rejects.toBeInstanceOf(ConnectorNotRegisteredError);
    expect(build).not.toHaveBeenCalled();
  });

  it("never uses a registration for another capability", async () => {
    const { registry, build } = setup(
      registration({ capability: "erp:delete-invoice" }),
    );

    await expect(
      registry.resolveCapability("erp:create-invoice"),
    ).rejects.toBeInstanceOf(ConnectorNotRegisteredError);
    expect(build).not.toHaveBeenCalled();
  });

  it("propagates a built in registry error other than not registered, reading nothing", async () => {
    const builtIn = {
      get: () => {
        throw new Error("unused");
      },
      resolveCapability: () => {
        throw new Error("registry unavailable");
      },
    };
    const findActive = vi.fn(async () => registration());
    const registry = new ExternalConnectorAwareRegistry(builtIn, {
      findActive,
      build: () => {
        throw new Error("unused");
      },
    });

    await expect(registry.resolveCapability("crm:read")).rejects.toThrow(
      "registry unavailable",
    );
    expect(findActive).not.toHaveBeenCalled();
  });

  it("an unknown id is refused with the built in registry's error", () => {
    const { registry } = setup(registration());

    expect(() => registry.get("sap")).toThrow("Unknown connector");
  });
});

describe("GatewayCapabilityConnectorPolicy", () => {
  const inner = (): ConnectorPolicy & { calls: number } => ({
    calls: 0,
    async assertAllowed() {
      this.calls += 1;
    },
  });
  const requestFor = (action: string) =>
    ({ executableContent: { action } }) as unknown as GatewayExecutionRequest;
  const connector = {} as SecureConnector;

  it("delegates a namespaced capability to the wrapped policy", async () => {
    const wrapped = inner();
    await new GatewayCapabilityConnectorPolicy(wrapped).assertAllowed(
      requestFor("crm:read"),
      connector,
      undefined,
    );
    expect(wrapped.calls).toBe(1);
  });

  it.each(["read", "CRM:read", "crm:", ":read", "crm:read:all"])(
    "refuses %j before the wrapped policy runs",
    async (action) => {
      const wrapped = inner();
      await expect(
        new GatewayCapabilityConnectorPolicy(wrapped).assertAllowed(
          requestFor(action),
          connector,
          undefined,
        ),
      ).rejects.toThrow(
        `Connector capability "${action}" is not a namespaced verb (expected a form like "crm:read").`,
      );
      expect(wrapped.calls).toBe(0);
    },
  );
});

describe("GatewayConnectorRegistry, exactly", () => {
  it("refuses a registration without an audit sink unless legacyInsecure is set", () => {
    const { legacyInsecure: _legacy, ...secure } =
      fixtureRegistration("stripe");
    expect(() => new GatewayConnectorRegistry().register(secure)).toThrow(
      'Connector "stripe" registration requires an ExecutionAuditSink',
    );
  });

  it("resolves a capability to the connector declaring it, and refuses one nobody declares", () => {
    const registry = new GatewayConnectorRegistry();
    registry.register(fixtureRegistration("hubspot", "crm:read"));
    registry.register(fixtureRegistration("slack", "slack:post-message"));

    expect(registry.resolveCapability("slack:post-message").connectorId).toBe(
      "slack",
    );
    expect(registry.resolveCapability("crm:read").connectorId).toBe("hubspot");
    expect(() => registry.resolveCapability("crm:write")).toThrow(
      ConnectorNotRegisteredError,
    );
  });
});
